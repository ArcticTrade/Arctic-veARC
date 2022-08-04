
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
    await veARC.connect(tester).collect();
    const ARCBalanceAfter = (await ARC.balanceOf(tester.address)).toString();
    return stringMinus(ARCBalanceAfter, ARCBalanceBefore);
}


async function tryModifyRewardPerBlock(veARC, owner, rewardPerBlock) {

    let ok = true;
    try {
        await veARC.connect(owner).modifyRewardPerBlock(rewardPerBlock);
    } catch (err) {
        ok = false;
    }
    return ok;
}

async function tryModifyEndBlock(veARC, owner, endBlock) {

    let ok = true;
    try {
        await veARC.connect(owner).modifyEndBlock(endBlock);
    } catch (err) {
        ok = false;
    }
    return ok;
}

async function tryModifyProvider(veARC, owner, providerAddress) {

    let ok = true;
    try {
        await veARC.connect(owner).modifyProvider(providerAddress);
    } catch (err) {
        ok = false;
    }
    return ok;
}

async function waitUntilJustBefore(destBlockNumber) {
    let currentBlockNumber = await ethers.provider.getBlockNumber();
    while (currentBlockNumber < destBlockNumber - 1) {
        await ethers.provider.send('evm_mine');
        currentBlockNumber = await ethers.provider.getBlockNumber();
    }
    return currentBlockNumber;
}

describe("test increase unlock time", function () {

    var signer, tester;
    var ARC;
    var veARC;

    var timestampStart;
    var rewardPerBlock;

    var q128;

    beforeEach(async function() {
      
        [signer, provider, provider2, provider3, tester, other, other2] = await ethers.getSigners();

        // a fake weth
        const tokenFactory = await ethers.getContractFactory("TestToken");
        ARC = await tokenFactory.deploy('ARC', 'ARC', 18);

        
        const veARCFactory = await ethers.getContractFactory("veARC");
        rewardPerBlock = '1200000000000000';
        veARC = await veARCFactory.deploy(ARC.address, {
            provider: provider.address,
            accRewardPerShare: 0,
            rewardPerBlock: rewardPerBlock,
            lastTouchBlock: 0,
            startBlock: 70,
            endBlock: 10000
        });

        await ARC.connect(tester).approve(veARC.address, '100000000000000000000');
        await ARC.mint(tester.address, '100000000000000000000');
        await ARC.connect(other).approve(veARC.address, '100000000000000000000');
        await ARC.mint(other.address, '100000000000000000000');
        await ARC.connect(other2).approve(veARC.address, '100000000000000000000');
        await ARC.mint(other2.address, '100000000000000000000');
        await ARC.connect(provider).approve(veARC.address, '100000000000000000000');
        await ARC.mint(provider.address, '100000000000000000000');

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

    it("increase amount", async function () {
        const WEEK = Number((await veARC.WEEK()).toString());
        const MAXTIME = Number((await veARC.MAXTIME()).toString());
        
        // phase1
        await waitUntilJustBefore(80);
        const startTime1 = timestampStart + Math.round(WEEK * 5.2);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime1]);

        await veARC.connect(tester).stake('1');
        const remainTime1 = String(timestampStart + WEEK * 35 - startTime1);
        let slope = stringDiv('220000000000000000', MAXTIME);
        const stakingStatus1 = await getStakingStatus(veARC, '1');
        const stakeARCAmount = (await veARC.stakeARCAmount()).toString();
        expect(stakeARCAmount).to.equal('220000000000000000');
        const lastVeARC1 = stringMul(slope, remainTime1);
        expect(lastVeARC1).to.equal(stakingStatus1.lastVeARC);
        const globalAcc1 = '0';
        const rewardInfo1 = await getRewardInfo(veARC);
        expect(rewardInfo1.accRewardPerShare).to.equal(globalAcc1);
        
        // phase2
        await waitUntilJustBefore(90);
        const startTime2 = timestampStart + Math.round(WEEK * 6.1);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime2]);

        const reward2 = await tryCollect(veARC, ARC, tester);
        const remainTime2 = String(timestampStart + WEEK * 35 - startTime2);
        const stakingStatus2 = await getStakingStatus(veARC, '1');
        const lastVeARC2 = stringMul(slope, remainTime2);
        expect(lastVeARC2).to.equal(stakingStatus2.lastVeARC);
        const deltaGlobalAcc2 = stringDiv(stringMul(stringMul(rewardPerBlock, '10'), q128), stakeARCAmount);
        const rewardInfo2 = await getRewardInfo(veARC);
        console.log('delta globalacc2: ', deltaGlobalAcc2);
        console.log(rewardInfo2.accRewardPerShare);
        expect(reward2).to.equal(stringDiv(stringMul(lastVeARC1, deltaGlobalAcc2), q128));


        // phase3
        await waitUntilJustBefore(100);
        const startTime3 = timestampStart + Math.round(WEEK * 7.9);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime3]);
        const addAmount = '660000000000000000';
        await veARC.connect(tester).increaseAmount('1', addAmount)

        const deltaGlobalAcc3 = stringDiv(stringMul(stringMul(rewardPerBlock, '10'), q128), stakeARCAmount);

        const stakeARCAmount3 = stringAdd(stakeARCAmount, addAmount);

        // phase4
        await waitUntilJustBefore(120);
        const startTime4 = timestampStart + Math.round(WEEK * 8);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime4]);
        const reward4 = await tryCollect(veARC, ARC, tester);

        const remainTime4 = String(timestampStart + WEEK * 35 - startTime4);
        const stakingStatus4 = await getStakingStatus(veARC, '1');

        slope = stringDiv(stringAdd('220000000000000000', addAmount), MAXTIME);
        const lastVeARC4 = stringMul(slope, remainTime4);
        expect(lastVeARC4).to.equal(stakingStatus4.lastVeARC);
        const deltaGlobalAcc4 = stringDiv(stringMul(stringMul(rewardPerBlock, '20'), q128), stakeARCAmount3);

        const expectReward4 = stringDiv(stringMul(stringAdd(deltaGlobalAcc3, deltaGlobalAcc4), lastVeARC2), q128);
        expect(reward4).to.equal(expectReward4);


        // phase5
        await waitUntilJustBefore(125);
        const startTime5 = timestampStart + Math.round(WEEK * 11.3);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime5]);
        const reward5 = await tryCollect(veARC, ARC, tester);

        const remainTime5 = String(timestampStart + WEEK * 35 - startTime5);
        const stakingStatus5 = await getStakingStatus(veARC, '1');

        const lastVeARC5 = stringMul(slope, remainTime5);
        expect(lastVeARC5).to.equal(stakingStatus5.lastVeARC);
        const deltaGlobalAcc5 = stringDiv(stringMul(stringMul(rewardPerBlock, '5'), q128), stakeARCAmount3);

        const expectReward5 = stringDiv(stringMul(deltaGlobalAcc5, lastVeARC4), q128);
        expect(reward4).to.equal(expectReward4);
    });

});