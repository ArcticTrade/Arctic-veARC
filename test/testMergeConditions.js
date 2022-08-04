
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

describe("test increase unlock time", function () {

    var signer, tester;
    var ARC;
    var veARC;

    var locks;

    var timestampStart;

    beforeEach(async function() {
      
        [signer, tester, other] = await ethers.getSigners();

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
        await ARC.connect(other).approve(veARC.address, '100000000000000000000');
        await ARC.mint(other.address, '100000000000000000000');

        const WEEK = Number((await veARC.WEEK()).toString());

    
        const blockNumStart = await ethers.provider.getBlockNumber();
        const blockStart = await ethers.provider.getBlock(blockNumStart);
        timestampStart = blockStart.timestamp;
        if (timestampStart % WEEK !== 0) {
            timestampStart = timestampStart - timestampStart % WEEK + WEEK;
        }

        await veARC.connect(tester).createLock('220000000', timestampStart + WEEK);
        await veARC.connect(other).createLock('190000000', timestampStart + WEEK);
        await veARC.connect(tester).createLock('280000000', timestampStart + WEEK * 30);
        await veARC.connect(other).createLock('310000000', timestampStart + WEEK * 30);
    });


    it("merge 1 to 3", async function () {
        const WEEK = Number((await veARC.WEEK()).toString());
        let ok = true;
        try {
            await veARC.connect(tester).merge('1', '3');
        } catch(err) {
            // console.log(err);
            ok = false;
        }
        expect(ok).to.equal(true);
        const lock1 = await veARC.nftLocked('1');
        expect(lock1.amount.toString()).to.equal('0');
        expect(lock1.end.toString()).to.equal(String(timestampStart + WEEK));
        const lock2 = await veARC.nftLocked('3');
        expect(lock2.amount.toString()).to.equal('500000000');
        expect(lock2.end.toString()).to.equal(String(timestampStart + WEEK * 30));
    });


    it("merge 3 to 1", async function () {
        const WEEK = Number((await veARC.WEEK()).toString());
        let ok = true;
        try {
            await veARC.connect(tester).merge('3', '1');
        } catch(err) {
            // console.log(err);
            ok = false;
        }
        expect(ok).to.equal(false);
        const lock1 = await veARC.nftLocked('1');
        expect(lock1.amount.toString()).to.equal('220000000');
        expect(lock1.end.toString()).to.equal(String(timestampStart + WEEK));
        const lock2 = await veARC.nftLocked('3');
        expect(lock2.amount.toString()).to.equal('280000000');
        expect(lock2.end.toString()).to.equal(String(timestampStart + WEEK * 30));
    });



    it("merge 2 to 3", async function () {
        const WEEK = Number((await veARC.WEEK()).toString());
        let ok = true;
        try {
            await veARC.connect(tester).merge('2', '3');
        } catch(err) {
            // console.log(err);
            ok = false;
        }
        expect(ok).to.equal(false);
        const lock1 = await veARC.nftLocked('2');
        expect(lock1.amount.toString()).to.equal('190000000');
        expect(lock1.end.toString()).to.equal(String(timestampStart + WEEK));
        const lock2 = await veARC.nftLocked('3');
        expect(lock2.amount.toString()).to.equal('280000000');
        expect(lock2.end.toString()).to.equal(String(timestampStart + WEEK * 30));
    });

    it("merge 1 to 4", async function () {
        const WEEK = Number((await veARC.WEEK()).toString());
        let ok = true;
        try {
            await veARC.connect(tester).merge('1', '4');
        } catch(err) {
            // console.log(err);
            ok = false;
        }
        expect(ok).to.equal(false);
        const lock1 = await veARC.nftLocked('1');
        expect(lock1.amount.toString()).to.equal('220000000');
        expect(lock1.end.toString()).to.equal(String(timestampStart + WEEK));
        const lock2 = await veARC.nftLocked('4');
        expect(lock2.amount.toString()).to.equal('310000000');
        expect(lock2.end.toString()).to.equal(String(timestampStart + WEEK * 30));
    });


    it("merge 1(staked) to 3", async function () {
        const WEEK = Number((await veARC.WEEK()).toString());
        await veARC.connect(tester).stake('1');
        let ok = true;
        try {
            await veARC.connect(tester).merge('1', '3');
        } catch(err) {
            // console.log(err);
            ok = false;
        }
        expect(ok).to.equal(false);
        const lock1 = await veARC.nftLocked('1');
        expect(lock1.amount.toString()).to.equal('220000000');
        expect(lock1.end.toString()).to.equal(String(timestampStart + WEEK));
        const lock2 = await veARC.nftLocked('3');
        expect(lock2.amount.toString()).to.equal('280000000');
        expect(lock2.end.toString()).to.equal(String(timestampStart + WEEK * 30));
    });

    it("merge 1 to 3(staked)", async function () {
        const WEEK = Number((await veARC.WEEK()).toString());
        await veARC.connect(tester).stake('3');
        let ok = true;
        try {
            await veARC.connect(tester).merge('1', '3');
        } catch(err) {
            // console.log(err);
            ok = false;
        }
        expect(ok).to.equal(false);
        const lock1 = await veARC.nftLocked('1');
        expect(lock1.amount.toString()).to.equal('220000000');
        expect(lock1.end.toString()).to.equal(String(timestampStart + WEEK));
        const lock2 = await veARC.nftLocked('3');
        expect(lock2.amount.toString()).to.equal('280000000');
        expect(lock2.end.toString()).to.equal(String(timestampStart + WEEK * 30));
    });

    it("merge 3 to 3", async function () {
        const WEEK = Number((await veARC.WEEK()).toString());
        await veARC.connect(tester).stake('3');
        let ok = true;
        try {
            await veARC.connect(tester).merge('3', '3');
        } catch(err) {
            // console.log(err);
            ok = false;
        }
        expect(ok).to.equal(false);
        const lock2 = await veARC.nftLocked('3');
        expect(lock2.amount.toString()).to.equal('280000000');
        expect(lock2.end.toString()).to.equal(String(timestampStart + WEEK * 30));
    });
});