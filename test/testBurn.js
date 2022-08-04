
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

describe("test burn condition", function () {

    var signer, tester;
    var ARC;
    var veARC;

    var locks;

    var timestampStart;

    var rewardPerBlock;
    var q128;

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

        rewardPerBlock = '100000000000000000';

        await ARC.connect(tester).approve(veARC.address, '100000000000000000000');
        await ARC.mint(tester.address, '100000000000000000000');
        await ARC.connect(other).approve(veARC.address, '100000000000000000000');
        await ARC.mint(other.address, '100000000000000000000');

        await ARC.approve(veARC.address, '100000000000000000000');
        await ARC.mint(signer.address, '100000000000000000000');

        const WEEK = Number((await veARC.WEEK()).toString());

    
        const blockNumStart = await ethers.provider.getBlockNumber();
        const blockStart = await ethers.provider.getBlock(blockNumStart);
        timestampStart = blockStart.timestamp;
        if (timestampStart % WEEK !== 0) {
            timestampStart = timestampStart - timestampStart % WEEK + WEEK;
        }

        await veARC.connect(tester).createLock('10000000000', timestampStart + WEEK * 10);
        await veARC.connect(other).createLock('20000000000', timestampStart + WEEK * 10);

        q128 = BigNumber(2).pow(128).toFixed(0);
    });


    it("burn after withdraw", async function () {
        const WEEK = Number((await veARC.WEEK()).toString());

        const startTime = timestampStart + Math.round(20 * WEEK);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime]);
        const balanceBefore = (await veARC.balanceOf(tester.address)).toString();
        expect(balanceBefore).to.equal('1')

        await veARC.connect(tester).withdraw('1');
        let ok = true;
        try {
            await veARC.connect(tester).burn('1');
        } catch(err) {
            // console.log(err);
            ok = false;
        }
        expect(ok).to.equal(true);
        const balanceAfter = (await veARC.balanceOf(tester.address)).toString();
        expect(balanceAfter).to.equal('0')
    });


    it("burn without withdraw", async function () {
        const WEEK = Number((await veARC.WEEK()).toString());

        const startTime = timestampStart + Math.round(20 * WEEK);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime]);
        const balanceBefore = (await veARC.balanceOf(tester.address)).toString();
        expect(balanceBefore).to.equal('1')

        let ok = true;
        try {
            await veARC.connect(tester).burn('1');
        } catch(err) {
            // console.log(err);
            ok = false;
        }
        expect(ok).to.equal(false);
        const balanceAfter = (await veARC.balanceOf(tester.address)).toString();
        expect(balanceAfter).to.equal('1')
    });


    it("burn others", async function () {
        const WEEK = Number((await veARC.WEEK()).toString());

        const startTime = timestampStart + Math.round(20 * WEEK);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime]);
        const balanceBefore = (await veARC.balanceOf(tester.address)).toString();
        expect(balanceBefore).to.equal('1')

        await veARC.connect(other).withdraw('2');
        let ok = true;
        try {
            await veARC.connect(tester).burn('2');
        } catch(err) {
            // console.log(err);
            ok = false;
        }
        expect(ok).to.equal(false);
        const balanceAfter = (await veARC.balanceOf(tester.address)).toString();
        expect(balanceAfter).to.equal('1')
    });


});