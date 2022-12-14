
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

async function waitUntilJustBefore(destBlockNumber) {
    let currentBlockNumber = await ethers.provider.getBlockNumber();
    while (currentBlockNumber < destBlockNumber - 1) {
        await ethers.provider.send('evm_mine');
        currentBlockNumber = await ethers.provider.getBlockNumber();
    }
    return currentBlockNumber;
}

async function getStakingStatus(veARC, nftId) {
    const stakingStatus = await veARC.stakingStatus(nftId);
    return {
        stakingId: stakingStatus.stakingId.toString(),
        lockAmount: stakingStatus.lockAmount.toString(),
        lastVeARC: stakingStatus.lastVeARC.toString(),
        lastTouchAccRewardPerShare: stakingStatus.lastTouchAccRewardPerShare.toString(),
    };
}

async function getStakingInfo(veARC, tester) {
    const stakingInfo = await veARC.stakingInfo(tester.address);
    return {
        stakingId: stakingInfo.stakingId.toString(),
        nftId: stakingInfo.nftId.toString(),
        amount: stakingInfo.amount.toString()
    }
}

async function getRewardInfo(veARC) {
    const rewardInfo = await veARC.rewardInfo();
    return {
        provider: rewardInfo.provider,
        accRewardPerShare: rewardInfo.accRewardPerShare.toString(),
        rewardPerBlock: rewardInfo.rewardPerBlock.toString(),
        lastTouchBlock: rewardInfo.lastTouchBlock.toString(),
        startBlock: rewardInfo.startBlock.toString(),
        endBlock: rewardInfo.endBlock.toString()
    }
}

async function tryCollect(veARC, ARC, tester) {
    const ARCBalanceBefore = (await ARC.balanceOf(tester.address)).toString();
    let ok = true;
    try {
        await veARC.connect(tester).collect();
    } catch (err) {
        // console.log(err);
        ok = false;
    }
    const ARCBalanceAfter = (await ARC.balanceOf(tester.address)).toString();
    return {reward: stringMinus(ARCBalanceAfter, ARCBalanceBefore), ok};
}

async function tryUnStake(veARC, ARC, tester) {
    const ARCBalanceBefore = (await ARC.balanceOf(tester.address)).toString();
    let ok = true;
    try {
    await veARC.connect(tester).unStake();
    } catch (err) {
        ok = false;
    }
    const ARCBalanceAfter = (await ARC.balanceOf(tester.address)).toString();
    return {reward: stringMinus(ARCBalanceAfter, ARCBalanceBefore), ok};
}

async function tryStake(veARC, nftId, tester) {
    let ok = true;
    try {
        await veARC.connect(tester).stake(nftId);
    } catch (err) {
        ok = false;
    }
    return ok;
}

describe("test increase unlock time", function () {

    var signer, tester;
    var ARC;
    var veARC;

    var timestampStart;
    var rewardPerBlock;

    var q128;

    beforeEach(async function() {
      
        [signer, tester, other, other2] = await ethers.getSigners();

        // a fake weth
        const tokenFactory = await ethers.getContractFactory("TestToken");
        ARC = await tokenFactory.deploy('ARC', 'ARC', 18);

        
        const veARCFactory = await ethers.getContractFactory("veARC");
        rewardPerBlock = '1200000000000000';
        veARC = await veARCFactory.deploy(ARC.address, {
            provider: signer.address,
            accRewardPerShare: 0,
            rewardPerBlock: rewardPerBlock,
            lastTouchBlock: 0,
            startBlock: 0,
            endBlock: 10000
        });

        await ARC.connect(tester).approve(veARC.address, '100000000000000000000');
        await ARC.mint(tester.address, '100000000000000000000');
        await ARC.connect(other).approve(veARC.address, '100000000000000000000');
        await ARC.mint(other.address, '100000000000000000000');
        await ARC.connect(other2).approve(veARC.address, '100000000000000000000');
        await ARC.mint(other2.address, '100000000000000000000');
        await ARC.connect(signer).approve(veARC.address, '100000000000000000000');
        await ARC.mint(signer.address, '100000000000000000000');

        const WEEK = Number((await veARC.WEEK()).toString());

    
        const blockNumStart = await ethers.provider.getBlockNumber();
        const blockStart = await ethers.provider.getBlock(blockNumStart);
        timestampStart = blockStart.timestamp;
        if (timestampStart % WEEK !== 0) {
            timestampStart = timestampStart - timestampStart % WEEK + WEEK;
        }

        await veARC.connect(tester).createLock('220000000000000000', timestampStart + WEEK * 35);
        await veARC.connect(other).createLock('190000000000000000', timestampStart + WEEK * 35);
        await veARC.connect(tester).createLock('280000000000000000', timestampStart + WEEK * 30);
        await veARC.connect(other).createLock('310000000000000000', timestampStart + WEEK * 30);
        await veARC.connect(other2).createLock('350000000000000000', timestampStart + WEEK * 40);
        await veARC.connect(other2).createLock('360000000000000000', timestampStart + WEEK * 41);
        await veARC.connect(other2).createLock('370000000000000000', timestampStart + WEEK * 42);

        q128 = BigNumber(2).pow(128).toFixed(0);
    });


    it("stake same nft again", async function () {
        const WEEK = Number((await veARC.WEEK()).toString());
        const MAXTIME = Number((await veARC.MAXTIME()).toString());

        expect((await veARC.ownerOf('1')).toLowerCase()).to.equal(tester.address.toLowerCase());
        const ok1 = await tryStake(veARC, '1', tester);
        expect(ok1).to.equal(true);
        expect((await veARC.stakedNft(tester.address)).toString()).to.equal('1');
        expect((await veARC.ownerOf('1')).toLowerCase()).to.equal(veARC.address.toLowerCase());

        const ok2 = await tryStake(veARC, '1', tester);
        expect(ok2).to.equal(false);
        expect((await veARC.stakedNft(tester.address)).toString()).to.equal('1');

        const startTime1 = timestampStart + Math.round(WEEK * 5.2);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime1]);
        const end1 = timestampStart + WEEK * 35;
        const stakingInfo = await getStakingInfo(veARC, tester);
        expect(stakingInfo.nftId).to.equal('1');
        expect(stakingInfo.stakingId).to.equal('1');
        const slope = stringDiv('220000000000000000', MAXTIME);
        expect(stakingInfo.amount, stringMul(slope, stringMinus(end1, startTime1)));
    });

    it("stake twice", async function () {
        const WEEK = Number((await veARC.WEEK()).toString());
        const MAXTIME = Number((await veARC.MAXTIME()).toString());

        const ok1 = await tryStake(veARC, '1', tester);
        expect(ok1).to.equal(true);
        expect((await veARC.stakedNft(tester.address)).toString()).to.equal('1');

        const ok2 = await tryStake(veARC, '3', tester);
        expect(ok2).to.equal(false);
        expect((await veARC.stakedNft(tester.address)).toString()).to.equal('1');
        expect((await veARC.ownerOf('3')).toLowerCase()).to.equal(tester.address.toLowerCase());

        const startTime1 = timestampStart + Math.round(WEEK * 5.2);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime1]);
        const end1 = timestampStart + WEEK * 35;
        const stakingInfo = await getStakingInfo(veARC, tester);
        expect(stakingInfo.nftId).to.equal('1');
        expect(stakingInfo.stakingId).to.equal('1');
        const slope = stringDiv('220000000000000000', MAXTIME);
        expect(stakingInfo.amount, stringMul(slope, stringMinus(end1, startTime1)));
    });

    it("stake other nft", async function () {

        const ok1 = await tryStake(veARC, '2', tester);
        expect(ok1).to.equal(false);
        expect((await veARC.stakedNft(tester.address)).toString()).to.equal('0');
        expect((await veARC.ownerOf('2')).toLowerCase()).to.equal(other.address.toLowerCase());

        const {reward, ok:okCollect} = await tryCollect(veARC, ARC, tester);
        expect(reward).to.equal('0');
        expect(okCollect).to.equal(false);

        const stakingInfo = await getStakingInfo(veARC, tester);
        expect(stakingInfo.nftId).to.equal('0');
        expect(stakingInfo.stakingId).to.equal('0');
        expect(stakingInfo.amount, '0');
    });


    it("nostake and unstake", async function () {

        const {reward, ok:okUnstake} = await tryUnStake(veARC, ARC, tester);
        expect(okUnstake).to.equal(false);
        expect(reward).to.equal('0');
        expect((await veARC.stakedNft(tester.address)).toString()).to.equal('0');
        expect((await veARC.ownerOf('1')).toLowerCase()).to.equal(tester.address.toLowerCase());

        const stakingInfo = await getStakingInfo(veARC, tester);
        expect(stakingInfo.nftId).to.equal('0');
        expect(stakingInfo.stakingId).to.equal('0');
        expect(stakingInfo.amount, '0');
    });



    it("stakingId changed", async function () {

        await tryStake(veARC, '1', tester);
        let stakingInfo = await getStakingInfo(veARC, tester);
        expect(stakingInfo.nftId).to.equal('1');
        expect(stakingInfo.stakingId).to.equal('1');
        
        await tryStake(veARC, '2', other);
        stakingInfo = await getStakingInfo(veARC, tester);
        expect(stakingInfo.nftId).to.equal('1');
        expect(stakingInfo.stakingId).to.equal('1');
        
        await tryUnStake(veARC, ARC, tester);
        stakingInfo = await getStakingInfo(veARC, tester);
        expect(stakingInfo.nftId).to.equal('0');
        expect(stakingInfo.stakingId).to.equal('0');

        await tryStake(veARC, '1', tester);
        stakingInfo = await getStakingInfo(veARC, tester);
        expect(stakingInfo.nftId).to.equal('1');
        expect(stakingInfo.stakingId).to.equal('3');
    });
});