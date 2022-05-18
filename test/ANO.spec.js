const {registerRelay, deployRelayHub, fundRecipient, balance, runRelayer} = require('@openzeppelin/gsn-helpers');
const {BN, constants, ether, expectEvent, expectRevert} = require('@openzeppelin/test-helpers');
const gsn = require('@openzeppelin/gsn-helpers');
const IRelayHub = artifacts.require('IRelayHub');
const chai = require('chai');
const expect = chai.expect;

const ANO = artifacts.require('ANO');

contract("ANO with GSN", function (accounts) {
    console.log(accounts)
    let ano;
    const tokenName = 'ANO Token';
    const symbol = 'ANO';
    const currency = 'NGN';
    const decimals = 18;
    const masterMinter = accounts[0];
    const pauser = accounts[0];
    const blacklister = accounts[0];
    const owner = accounts[0];
    const minter = accounts[1];
    const minterAllowedAmount = 50000;
    const totalSupply = 500000000000;
    let mintedAmount = 5000;
    const gsnFee = 10;

    before(async function () {
        ano = await ANO.new();
        // console.log(ano)
        await ano.initialize(tokenName, symbol, currency, decimals, masterMinter, pauser, blacklister, owner, gsnFee, totalSupply);


        await deployRelayHub(web3, {
            from: accounts[0]
        });

        await runRelayer({
            relayUrl: 'http://localhost:8090',
            workdir: process.cwd(),
            devMode: true,
            ethereumNodeURL: 'http://localhost:8545',
            gasPricePercent: 0,
            port: 8090,
            quiet: true
        });

        await registerRelay(web3, {
            relayUrl: 'http://localhost:8090',
            stake: ether('1'),
            unstakeDelay: 604800,
            funds: ether('5'),
            from: accounts[0]
        });

        await fundRecipient(web3, {
            recipient: ano.address,
            amount: ether('2'),
            from: accounts[0]
        });
    });

    context('when transfer is called', function () {
        beforeEach(async function () {
            await gsn.fundRecipient(web3, {recipient: ano.address});
            this.relayHub = await IRelayHub.at('0xD216153c06E857cD7f72665E0aF1d7D82172F494');

            await ano.configureMinter(minter, minterAllowedAmount, {from: masterMinter});
            await ano.mint(minter, mintedAmount, {from: minter});
        });

        it("should transfer the right amount of tokens", async () => {
            const transferAmount = mintedAmount - gsnFee;
            const recipient = accounts[2];

            const recipientPreviousBalance = await ano.balanceOf(recipient);

            const {tx} = await ano.transfer(recipient, transferAmount, {
                from: minter,
                useGSN: true
            });

            await expectEvent.inTransaction(tx, IRelayHub, 'TransactionRelayed', {status: '0'});

            const senderNewBalance = await ano.balanceOf(minter);
            const recipientNewBalance = await ano.balanceOf(recipient);

            const expectedSenderNewBalance = new BN(mintedAmount - transferAmount - gsnFee);
            const expectedRecipientNewBalance = new BN(recipientPreviousBalance + transferAmount);


            expect(senderNewBalance).to.be.bignumber.equal(expectedSenderNewBalance);
            expect(recipientNewBalance).to.be.bignumber.equal(expectedRecipientNewBalance);
        });

        context('when the sender does not have enough tokens', async () => {

            it("should reject the transaction", async () => {
                const transferAmount = mintedAmount; // will be less than required because of  gsnFee
                const recipient = accounts[2];

                expect(async function () {
                    await ano.transfer(recipient, transferAmount, {
                        from: minter,
                        useGSN: true
                    }).to.throw();
                })
            });
        });
    });


    context('when approve is called', function () {
        beforeEach(async function () {
            mintedAmount = gsnFee;
            await gsn.fundRecipient(web3, {recipient: ano.address});
            this.relayHub = await IRelayHub.at('0xD216153c06E857cD7f72665E0aF1d7D82172F494');

            await ano.configureMinter(minter, minterAllowedAmount, {from: masterMinter});
            await ano.mint(minter, mintedAmount, {from: minter});
        });

        context("should approve transactions without issues", async () => {
            let approverPreviousBalance;
            let approverNewBalance;

            it("should approve spender without any issues", async () => {
                const allowedAmount = 1000;
                const spender = accounts[3];

                approverPreviousBalance = await ano.balanceOf(minter);

                const {tx} = await ano.approve(spender, allowedAmount, {
                    from: minter,
                    useGSN: true
                });

                await expectEvent.inTransaction(tx, IRelayHub, 'TransactionRelayed', {status: '0'});

                approverNewBalance = await ano.balanceOf(minter);
                const allowance = await ano.allowance(minter, spender);

                expect(allowance).to.be.bignumber.equal(allowance);
            });

            it('should charge approver', async () => {
                const approvalCharge = approverPreviousBalance - approverNewBalance;
                expect(approvalCharge).to.equal(gsnFee);
            })
        });

        context('when the user does not have up to gsnFee', async () => {
            beforeEach(async function () {
                mintedAmount = gsnFee - 1;
                await gsn.fundRecipient(web3, {recipient: ano.address});
                this.relayHub = await IRelayHub.at('0xD216153c06E857cD7f72665E0aF1d7D82172F494');

                await ano.configureMinter(minter, minterAllowedAmount, {from: masterMinter});
                await ano.mint(minter, mintedAmount, {from: minter});
            });

            it("should reject the transaction", async () => {
                const allowedAmount = 1000;
                const spender = accounts[4];

                expect(async function () {
                    await ano.approve(spender, allowedAmount, {
                        from: minter,
                        useGSN: true
                    }).to.throw();
                })
            });
        });
    });

    context('when a function that is not approve, transfer or transferFrom is called', function () {
        beforeEach(async function () {
            await gsn.fundRecipient(web3, {recipient: ano.address});
            this.relayHub = await IRelayHub.at('0xD216153c06E857cD7f72665E0aF1d7D82172F494');
        });

        it("should work without GSN", async () => {
            expect(async function () {
                await ano.totalSupply({
                    from: minter
                }).to.not.throw();
            })
        });

        it("should reject the transaction with GSN", async () => {
            expect(async function () {
                await ano.totalSupply({
                    from: minter,
                    useGSN: true
                }).to.throw();
            })
        });
    });

});