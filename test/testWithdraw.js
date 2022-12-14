
const { BigNumber } = require("bignumber.js");
const { expect } = require("chai");
const hardhat = require('hardhat');
const { ethers } = require("hardhat");;

async function getToken() {

  // deploy token
  const tokenFactory = await ethers.getContractFactory("TestToken")
  token = await tokenFactory.deploy('a', 'a', 18);
  await token.deployed();
  return token;
}

function decimalToUnDecimalStr(num) {
    return new BigNumber(num).times(10 ** 18).toFixed(0);
}

function stringDiv(a, b) {
    let an = new BigNumber(a);
    an = an.minus(an.mod(b));
    return an.div(b).toFixed(0, 3);
}

function stringMul(a, b) {
    let an = new BigNumber(a);
    an = an.times(b);
    return an.toFixed(0, 3);
}

function stringMinus(a, b) {
    let an = new BigNumber(a);
    an = an.minus(b);
    return an.toFixed(0, 3);
}

function stringAdd(a, b) {
    let an = new BigNumber(a);
    an = an.plus(b);
    return an.toFixed(0, 3);
}

function getBiasAndSlopeStr(amount, lockTime, MAXTIME) {
    const slope = stringDiv(amount, MAXTIME);
    const bias = stringMul(slope, lockTime);
    return {slope, bias};
}

function getBiasAndSlope(amount, lockTime, MAXTIME) {
    return getBiasAndSlopeStr(String(amount), String(lockTime), String(MAXTIME));
}

async function getNftLocked(veARC, nftId) {
    const nftLocked = await veARC.nftLocked(nftId);
    return {amount: Number(nftLocked.amount.toString()), end: Number(nftLocked.end.toString())};
}

async function getPoint(veARC, epoch) {
    const point = await veARC.pointHistory(epoch);
    return {bias: point.bias.toString(), slope: point.slope.toString(), timestamp: Number(point.timestamp.toString())};
}

async function waitUntilJustBefore(destBlockNumber) {
    let currentBlockNumber = await ethers.provider.getBlockNumber();
    while (currentBlockNumber < destBlockNumber - 1) {
        await ethers.provider.send('evm_mine');
        currentBlockNumber = await ethers.provider.getBlockNumber();
    }
    return currentBlockNumber;
}

function getLockData(slope, MAXTIME, startTime, endTime) {
    const amount = slope * MAXTIME;
    const bias = slope * (endTime - startTime);
    return {
        slope,
        amount,
        bias,
        startTime,
        endTime,
    };
}

function getLastPointAndSlopeChanges(locks, timestamp) {
    let bias = 0;
    let slope = 0;
    const slopeChanges = {};
    for (const lock of locks) {
        // it is assumed that lock.startTime <= timestamp
        if (lock.endTime > timestamp) {
            bias = bias + lock.bias - (timestamp - lock.startTime) * lock.slope
            slope = slope + lock.slope;
            if (slopeChanges[lock.endTime] == undefined) {
                slopeChanges[lock.endTime] = -lock.slope;
            } else {
                slopeChanges[lock.endTime] -= lock.slope;
            }
        }
    }
    return {bias, slope, slopeChanges};
}

const abi = [
    {
        "inputs": [
            {
            "internalType": "uint256",
            "name": "_value",
            "type": "uint256"
            },
            {
            "internalType": "uint256",
            "name": "_unlockTime",
            "type": "uint256"
            }
        ],
        "name": "createLock",
        "outputs": [
            {
            "internalType": "uint256",
            "name": "nftId",
            "type": "uint256"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "nftId",
          "type": "uint256"
        }
      ],
      "name": "withdraw",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    }
];

function getNewLockCalling(amount, endTime, veARCAddress) {
    const veARC = new web3.eth.Contract(abi, veARCAddress);
    return veARC.methods.createLock(amount, endTime).encodeABI();
}

function getWithdrawCalling(nftId, amount, veARCAddress) {
    const veARC = new web3.eth.Contract(abi, veARCAddress);
    return veARC.methods.withdraw(nftId).encodeABI();
}

describe("test increase amount", function () {

    var signer, tester;
    var ARC;
    var veARC;

    var locks;

    var timestampStart;

    beforeEach(async function() {
      
        [signer, tester] = await ethers.getSigners();

        // a fake weth
        const tokenFactory = await ethers.getContractFactory("TestToken");
        ARC = await tokenFactory.deploy('ARC', 'ARC', 18);

        
        const veARCFactory = await ethers.getContractFactory("veARC");
        veARC = await veARCFactory.deploy(ARC.address, {
            provider: signer.address,
            accRewardPerShare: 0,
            rewardPerBlock: '100000000000000000',
            lastTouchBlock: 0,
            startBlock: 0,
            endBlock: 1000
        });

        await ARC.connect(tester).approve(veARC.address, '100000000000000000000');
        await ARC.mint(tester.address, '100000000000000000000');

        const MAXTIME = Number((await veARC.MAXTIME()).toString());
        const WEEK = Number((await veARC.WEEK()).toString());

        locks = [
            getLockData(20, MAXTIME, Math.round(1.1 * WEEK), 20 * WEEK),
            getLockData(6, MAXTIME, Math.round(1.1 * WEEK), 17 * WEEK),
            getLockData(15, MAXTIME, Math.round(1.1 * WEEK), 25 * WEEK),

            getLockData(5, MAXTIME, Math.round(2.3 * WEEK), 20 * WEEK),
            getLockData(21, MAXTIME, Math.round(2.3 * WEEK), 16 * WEEK),

            getLockData(36, MAXTIME, Math.round(5.6 * WEEK), 25 * WEEK),
            getLockData(12, MAXTIME, Math.round(5.6 * WEEK), 16 * WEEK),
            getLockData(16, MAXTIME, Math.round(5.6 * WEEK), 21 * WEEK),
        ]

        const blockNumStart = await ethers.provider.getBlockNumber();
        const blockStart = await ethers.provider.getBlock(blockNumStart);
        timestampStart = blockStart.timestamp;
        if (timestampStart % WEEK !== 0) {
            timestampStart = timestampStart - timestampStart % WEEK + WEEK;
        }

        for (const lock of locks) {
            lock.endTime += timestampStart;
            lock.startTime += timestampStart;
        }
        
        const startTime1 = timestampStart + Math.round(1.1 * WEEK);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime1]); 
        const createLockCallings1 = [
            getNewLockCalling(locks[0].amount, locks[0].endTime),
            getNewLockCalling(locks[1].amount, locks[1].endTime),
            getNewLockCalling(locks[2].amount, locks[2].endTime),
        ];
        await veARC.connect(tester).multicall(createLockCallings1);

        const startTime2 = timestampStart + Math.round(2.3 * WEEK);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime2]);
        const createLockCallings2 = [
            getNewLockCalling(locks[3].amount, locks[3].endTime),
            getNewLockCalling(locks[4].amount, locks[4].endTime),
        ];
        await veARC.connect(tester).multicall(createLockCallings2);

        const startTime3 = timestampStart + Math.round(5.6 * WEEK);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime3]);
        const createLockCallings3 = [
            getNewLockCalling(locks[5].amount, locks[5].endTime),
            getNewLockCalling(locks[6].amount, locks[6].endTime),
            getNewLockCalling(locks[7].amount, locks[7].endTime),
        ];
        await veARC.connect(tester).multicall(createLockCallings3);

    });
    
    it("at 20 WEEK, create a new lock, withdraw 1", async function () {

        const nftId = 1;

        const MAXTIME = (await veARC.MAXTIME()).toString();
        const WEEK = Number((await veARC.WEEK()).toString());

        let balance = (await ARC.balanceOf(tester.address)).toString();
        locks.push(getLockData(7, MAXTIME, Math.round(20 * WEEK), 30 * WEEK));
        locks[8].startTime += timestampStart;
        locks[8].endTime += timestampStart;


        const startTime = timestampStart + Math.round(20 * WEEK);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime]);

        const callings = [
            getNewLockCalling(locks[8].amount, locks[8].endTime),
            getWithdrawCalling(nftId, veARC.address)
        ];
        balance = stringMinus(balance, locks[8].amount);
        balance = stringAdd(balance, String(locks[nftId - 1].amount));
        await veARC.connect(tester).multicall(callings);

        locks[nftId - 1].amount = 0;
        locks[nftId - 1].slope = 0;
        locks[nftId - 1].bias = 0;

        const lock1 = await veARC.nftLocked(nftId);
        expect(lock1.amount.toString()).to.equal(String(locks[nftId - 1].amount));
        expect(lock1.end.toString()).to.equal('0');

        const {bias, slope, slopeChanges} = getLastPointAndSlopeChanges(locks, startTime);
        const epoch = await veARC.epoch();

        const point = await veARC.pointHistory(epoch);
        expect(point.bias.toString()).to.equal(BigNumber(bias).toFixed(0));
        expect(point.slope.toString()).to.equal(BigNumber(slope).toFixed(0));
        expect(point.timestamp.toString()).to.equal(BigNumber(startTime).toFixed(0));

        for (var week = 21; week <= 35; week ++) {
            const checkTime1 = timestampStart + week * WEEK - Math.round(WEEK / 2);
            const sc1 = (await veARC.slopeChanges(checkTime1)).toString();
            expect(sc1).to.equal('0');

            const checkTime2 = timestampStart + week * WEEK;
            const sc2 = (await veARC.slopeChanges(checkTime2)).toString();
            let slopeChangeValue = slopeChanges[checkTime2];
            if (slopeChangeValue == undefined) {
                slopeChangeValue = 0;
            }
            const sc2Expect = String(slopeChangeValue);
            expect(sc2).to.equal(sc2Expect);
        }
        expect((await ARC.balanceOf(tester.address)).toString()).to.equal(balance);
    });

    it("at 20 WEEK, create a new lock, withdraw 2", async function () {

        const nftId = 2;

        const MAXTIME = (await veARC.MAXTIME()).toString();
        const WEEK = Number((await veARC.WEEK()).toString());

        let balance = (await ARC.balanceOf(tester.address)).toString();
        locks.push(getLockData(7, MAXTIME, Math.round(20 * WEEK), 30 * WEEK));
        locks[8].startTime += timestampStart;
        locks[8].endTime += timestampStart;


        const startTime = timestampStart + Math.round(20 * WEEK);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime]);

        const callings = [
            getNewLockCalling(locks[8].amount, locks[8].endTime),
            getWithdrawCalling(nftId, veARC.address)
        ];
        balance = stringMinus(balance, locks[8].amount);
        balance = stringAdd(balance, String(locks[nftId - 1].amount));
        await veARC.connect(tester).multicall(callings);

        locks[nftId - 1].amount = 0;
        locks[nftId - 1].slope = 0;
        locks[nftId - 1].bias = 0;

        const lock1 = await veARC.nftLocked(nftId);
        expect(lock1.amount.toString()).to.equal(String(locks[nftId - 1].amount));
        expect(lock1.end.toString()).to.equal('0');

        const {bias, slope, slopeChanges} = getLastPointAndSlopeChanges(locks, startTime);
        const epoch = await veARC.epoch();

        const point = await veARC.pointHistory(epoch);
        expect(point.bias.toString()).to.equal(BigNumber(bias).toFixed(0));
        expect(point.slope.toString()).to.equal(BigNumber(slope).toFixed(0));
        expect(point.timestamp.toString()).to.equal(BigNumber(startTime).toFixed(0));

        for (var week = 21; week <= 35; week ++) {
            const checkTime1 = timestampStart + week * WEEK - Math.round(WEEK / 2);
            const sc1 = (await veARC.slopeChanges(checkTime1)).toString();
            expect(sc1).to.equal('0');

            const checkTime2 = timestampStart + week * WEEK;
            const sc2 = (await veARC.slopeChanges(checkTime2)).toString();
            let slopeChangeValue = slopeChanges[checkTime2];
            if (slopeChangeValue == undefined) {
                slopeChangeValue = 0;
            }
            const sc2Expect = String(slopeChangeValue);
            expect(sc2).to.equal(sc2Expect);
        }
        expect((await ARC.balanceOf(tester.address)).toString()).to.equal(balance);
    });

    it("at 20.5 WEEK withdraw 7", async function () {

        const nftId = 7;

        const MAXTIME = (await veARC.MAXTIME()).toString();
        const WEEK = Number((await veARC.WEEK()).toString());

        let balance = (await ARC.balanceOf(tester.address)).toString();

        const startTime = timestampStart + Math.round(20.5 * WEEK);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime]);

        balance = stringAdd(balance, String(locks[nftId - 1].amount));
        await veARC.connect(tester).withdraw(nftId);

        locks[nftId - 1].amount = 0;
        locks[nftId - 1].slope = 0;
        locks[nftId - 1].bias = 0;

        const lock1 = await veARC.nftLocked(nftId);
        expect(lock1.amount.toString()).to.equal(String(locks[nftId - 1].amount));
        expect(lock1.end.toString()).to.equal('0');

        const {bias, slope, slopeChanges} = getLastPointAndSlopeChanges(locks, startTime);
        const epoch = await veARC.epoch();

        const point = await veARC.pointHistory(epoch);
        expect(point.bias.toString()).to.equal(BigNumber(bias).toFixed(0));
        expect(point.slope.toString()).to.equal(BigNumber(slope).toFixed(0));
        expect(point.timestamp.toString()).to.equal(BigNumber(startTime).toFixed(0));

        for (var week = 21; week <= 35; week ++) {
            const checkTime1 = timestampStart + week * WEEK - Math.round(WEEK / 2);
            const sc1 = (await veARC.slopeChanges(checkTime1)).toString();
            expect(sc1).to.equal('0');

            const checkTime2 = timestampStart + week * WEEK;
            const sc2 = (await veARC.slopeChanges(checkTime2)).toString();
            let slopeChangeValue = slopeChanges[checkTime2];
            if (slopeChangeValue == undefined) {
                slopeChangeValue = 0;
            }
            const sc2Expect = String(slopeChangeValue);
            expect(sc2).to.equal(sc2Expect);
        }
        expect((await ARC.balanceOf(tester.address)).toString()).to.equal(balance);
    });
});