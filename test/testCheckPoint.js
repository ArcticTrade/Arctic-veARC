
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

describe("test uniswap price oracle", function () {

    var signer, tester;
    var ARC;
    var veARC;

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

        await ARC.connect(tester).approve(veARC.address, decimalToUnDecimalStr(100000000));
        await ARC.mint(tester.address, decimalToUnDecimalStr(100000000));
        
    });
    
    it("check point", async function () {

        const MAXTIME = Number((await veARC.MAXTIME()).toString());
        const WEEK = Number((await veARC.WEEK()).toString());

        console.log('max time: ', MAXTIME);
        console.log('week time: ', WEEK);

        const blockNumStart = await ethers.provider.getBlockNumber();
        const blockStart = await ethers.provider.getBlock(blockNumStart);
        let timestampStart = blockStart.timestamp;
        if (timestampStart % WEEK !== 0) {
            timestampStart = timestampStart - timestampStart % WEEK + WEEK;
        }

        let ARCBalance = (await ARC.balanceOf(tester.address)).toString();

        
        // lock1
        const startTime1 = timestampStart + WEEK + Math.round(WEEK / 7);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime1]); 
        // currentBlockNumber = await waitUntilJustBefore(startTime1);
        console.log('start time: ', startTime1);
        // console.log('current bn: ', currentBlockNumber);
        const unlockTime1 = timestampStart + 20 * WEEK;
        const ARCAmount1 = decimalToUnDecimalStr(10);
        await veARC.connect(tester).createLock(ARCAmount1, unlockTime1);

        const segment1 = getBiasAndSlope(ARCAmount1, unlockTime1 - startTime1, MAXTIME);
        console.log('segment1: ', segment1);
        const point1 = await getPoint(veARC, 1);
        console.log('point1: ', point1);

        expect(point1.bias).to.equal(segment1.bias);
        expect(point1.slope).to.equal(segment1.slope);
        expect(point1.timestamp).to.equal(startTime1);

        ARCBalance = stringMinus(ARCBalance, ARCAmount1);
        expect((await ARC.balanceOf(tester.address)).toString()).to.equal(ARCBalance);

        const currentPoint = {...segment1};

        // lock2
        const startTime2 = timestampStart + WEEK + Math.round(WEEK / 7 * 6);
        const unlockTime2 = timestampStart + 25 * WEEK;
        const ARCAmount2 = decimalToUnDecimalStr(5);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime2]); 
        await veARC.connect(tester).createLock(ARCAmount2, unlockTime2);
        const segment2 = getBiasAndSlope(ARCAmount2, unlockTime2 - startTime2, MAXTIME);
        // compute current point
        currentPoint.bias = stringMinus(currentPoint.bias, stringMul(String(startTime2-startTime1), currentPoint.slope));
        currentPoint.bias = stringAdd(currentPoint.bias, segment2.bias);
        currentPoint.slope = stringAdd(currentPoint.slope, segment2.slope);

        const point2 = await getPoint(veARC, 2);
        expect(point2.bias).to.equal(currentPoint.bias);
        expect(point2.slope).to.equal(currentPoint.slope);
        expect(point2.timestamp).to.equal(startTime2);
        ARCBalance = stringMinus(ARCBalance, ARCAmount2);
        expect((await ARC.balanceOf(tester.address)).toString()).to.equal(ARCBalance);

        // lock3
        const startTime3 = timestampStart + WEEK * 6 + Math.round(WEEK / 7 * 3);
        const unlockTime3 = timestampStart + 30 * WEEK;
        const ARCAmount3 = decimalToUnDecimalStr(7);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime3]); 
        await veARC.connect(tester).createLock(ARCAmount3, unlockTime3);
        const segment3 = getBiasAndSlope(ARCAmount3, unlockTime3 - startTime3, MAXTIME);
        // compute current point
        currentPoint.bias = stringMinus(currentPoint.bias, stringMul(String(startTime3-startTime2), currentPoint.slope));
        currentPoint.bias = stringAdd(currentPoint.bias, segment3.bias);
        currentPoint.slope = stringAdd(currentPoint.slope, segment3.slope);
        
        const point3 = await getPoint(veARC, 3);
        expect(point3.bias).to.equal(currentPoint.bias);
        expect(point3.slope).to.equal(currentPoint.slope);
        expect(point3.timestamp).to.equal(startTime3);
        ARCBalance = stringMinus(ARCBalance, ARCAmount3);
        expect((await ARC.balanceOf(tester.address)).toString()).to.equal(ARCBalance);

        // console.log('bias at 3: ', currentPoint.bias);

        // lock4
        const startTime4 = timestampStart + WEEK * 8 + Math.round(WEEK / 7 * 2);
        const unlockTime4 = timestampStart + 10 * WEEK;
        const ARCAmount4 = decimalToUnDecimalStr(30);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime4]); 
        await veARC.connect(tester).createLock(ARCAmount4, unlockTime4);
        const segment4 = getBiasAndSlope(ARCAmount4, unlockTime4 - startTime4, MAXTIME);
        
        currentPoint.bias = stringMinus(currentPoint.bias, stringMul(String(startTime4-startTime3), currentPoint.slope));
        currentPoint.bias = stringAdd(currentPoint.bias, segment4.bias);
        currentPoint.slope = stringAdd(currentPoint.slope, segment4.slope);

        const point4 = await getPoint(veARC, 4);
        expect(point4.bias).to.equal(currentPoint.bias);
        expect(point4.slope).to.equal(currentPoint.slope);
        expect(point4.timestamp).to.equal(startTime4);
        ARCBalance = stringMinus(ARCBalance, ARCAmount4);
        expect((await ARC.balanceOf(tester.address)).toString()).to.equal(ARCBalance);

        // lock5
        const startTime5 = timestampStart + WEEK * 8 + Math.round(WEEK / 7 * 3);
        const unlockTime5 = timestampStart + 10 * WEEK;
        const ARCAmount5 = decimalToUnDecimalStr(23);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime5]); 
        await veARC.connect(tester).createLock(ARCAmount5, unlockTime5);
        const segment5 = getBiasAndSlope(ARCAmount5, unlockTime5 - startTime5, MAXTIME);
        
        currentPoint.bias = stringMinus(currentPoint.bias, stringMul(String(startTime5-startTime4), currentPoint.slope));
        currentPoint.bias = stringAdd(currentPoint.bias, segment5.bias);
        currentPoint.slope = stringAdd(currentPoint.slope, segment5.slope);

        const point5 = await getPoint(veARC, 5);
        expect(point5.bias).to.equal(currentPoint.bias);
        expect(point5.slope).to.equal(currentPoint.slope);
        expect(point5.timestamp).to.equal(startTime5);
        ARCBalance = stringMinus(ARCBalance, ARCAmount5);
        expect((await ARC.balanceOf(tester.address)).toString()).to.equal(ARCBalance);


        // lock6
        const startTime6 = timestampStart + WEEK * 8 + Math.round(WEEK / 7 * 4);
        const unlockTime6 = timestampStart + 11 * WEEK;
        const ARCAmount6 = decimalToUnDecimalStr(92);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime6]); 
        await veARC.connect(tester).createLock(ARCAmount6, unlockTime6);
        const segment6 = getBiasAndSlope(ARCAmount6, unlockTime6 - startTime6, MAXTIME);
        
        currentPoint.bias = stringMinus(currentPoint.bias, stringMul(String(startTime6-startTime5), currentPoint.slope));
        currentPoint.bias = stringAdd(currentPoint.bias, segment6.bias);
        currentPoint.slope = stringAdd(currentPoint.slope, segment6.slope);

        const point6 = await getPoint(veARC, 6);
        expect(point6.bias).to.equal(currentPoint.bias);
        expect(point6.slope).to.equal(currentPoint.slope);
        expect(point6.timestamp).to.equal(startTime6);
        ARCBalance = stringMinus(ARCBalance, ARCAmount6);
        expect((await ARC.balanceOf(tester.address)).toString()).to.equal(ARCBalance);

        // lock7
        const startTime7 = timestampStart + WEEK * 8 + Math.round(WEEK / 7 * 5);
        const unlockTime7 = timestampStart + 11 * WEEK;
        const ARCAmount7 = decimalToUnDecimalStr(18);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime7]);
        await veARC.connect(tester).createLock(ARCAmount7, unlockTime7);
        const segment7 = getBiasAndSlope(ARCAmount7, unlockTime7 - startTime7, MAXTIME);
        
        currentPoint.bias = stringMinus(currentPoint.bias, stringMul(String(startTime7-startTime6), currentPoint.slope));
        currentPoint.bias = stringAdd(currentPoint.bias, segment7.bias);
        currentPoint.slope = stringAdd(currentPoint.slope, segment7.slope);

        const point7 = await getPoint(veARC, 7);
        expect(point7.bias).to.equal(currentPoint.bias);
        expect(point7.slope).to.equal(currentPoint.slope);
        expect(point7.timestamp).to.equal(startTime7);
        ARCBalance = stringMinus(ARCBalance, ARCAmount7);
        expect((await ARC.balanceOf(tester.address)).toString()).to.equal(ARCBalance);

        // lock8
        const startTime8 = timestampStart + WEEK * 8 + Math.round(WEEK / 7 * 6);
        const unlockTime8 = timestampStart + 11 * WEEK;
        const ARCAmount8 = decimalToUnDecimalStr(12);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime8]);
        await veARC.connect(tester).createLock(ARCAmount8, unlockTime8);
        const segment8 = getBiasAndSlope(ARCAmount8, unlockTime8 - startTime8, MAXTIME);
        
        currentPoint.bias = stringMinus(currentPoint.bias, stringMul(String(startTime8-startTime7), currentPoint.slope));
        currentPoint.bias = stringAdd(currentPoint.bias, segment8.bias);
        currentPoint.slope = stringAdd(currentPoint.slope, segment8.slope);

        const point8 = await getPoint(veARC, 8);
        expect(point8.bias).to.equal(currentPoint.bias);
        expect(point8.slope).to.equal(currentPoint.slope);
        expect(point8.timestamp).to.equal(startTime8);
        ARCBalance = stringMinus(ARCBalance, ARCAmount8);
        expect((await ARC.balanceOf(tester.address)).toString()).to.equal(ARCBalance);

        // lock9
        const startTime9 = timestampStart + WEEK * 10;
        const unlockTime9 = timestampStart + WEEK * 35;
        const ARCAmount9 = decimalToUnDecimalStr(215);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime9]);
        await veARC.connect(tester).createLock(ARCAmount9, unlockTime9);
        const segment9 = getBiasAndSlope(ARCAmount9, unlockTime9 - startTime9, MAXTIME);
        
        currentPoint.bias = stringMinus(currentPoint.bias, stringMul(String(startTime9-startTime8), currentPoint.slope));
        currentPoint.slope = stringMinus(currentPoint.slope, segment4.slope);
        currentPoint.slope = stringMinus(currentPoint.slope, segment5.slope);
        currentPoint.bias = stringAdd(currentPoint.bias, segment9.bias);
        currentPoint.slope = stringAdd(currentPoint.slope, segment9.slope);

        const point9 = await getPoint(veARC, 9);
        expect(point9.bias).to.equal(currentPoint.bias);
        expect(point9.slope).to.equal(currentPoint.slope);
        expect(point9.timestamp).to.equal(startTime9);
        ARCBalance = stringMinus(ARCBalance, ARCAmount9);
        expect((await ARC.balanceOf(tester.address)).toString()).to.equal(ARCBalance);

        // lock10
        const startTime10 = timestampStart + WEEK * 10 + Math.round(WEEK / 7 * 2);
        const unlockTime10 = timestampStart + WEEK * 25;
        const ARCAmount10 = decimalToUnDecimalStr(11);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime10]);
        await veARC.connect(tester).createLock(ARCAmount10, unlockTime10);
        const segment10 = getBiasAndSlope(ARCAmount10, unlockTime10 - startTime10, MAXTIME);
        
        currentPoint.bias = stringMinus(currentPoint.bias, stringMul(String(startTime10-startTime9), currentPoint.slope));
        currentPoint.bias = stringAdd(currentPoint.bias, segment10.bias);
        currentPoint.slope = stringAdd(currentPoint.slope, segment10.slope);

        const point10 = await getPoint(veARC, 10);
        expect(point10.bias).to.equal(currentPoint.bias);
        expect(point10.slope).to.equal(currentPoint.slope);
        expect(point10.timestamp).to.equal(startTime10);
        ARCBalance = stringMinus(ARCBalance, ARCAmount10);
        expect((await ARC.balanceOf(tester.address)).toString()).to.equal(ARCBalance);

        // lock11
        const startTime11 = timestampStart + WEEK * 10 + Math.round(WEEK / 7 * 3);
        const unlockTime11 = timestampStart + WEEK * 20;
        const ARCAmount11 = decimalToUnDecimalStr(115);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime11]);
        await veARC.connect(tester).createLock(ARCAmount11, unlockTime11);
        const segment11 = getBiasAndSlope(ARCAmount11, unlockTime11 - startTime11, MAXTIME);
        
        currentPoint.bias = stringMinus(currentPoint.bias, stringMul(String(startTime11-startTime10), currentPoint.slope));
        currentPoint.bias = stringAdd(currentPoint.bias, segment11.bias);
        currentPoint.slope = stringAdd(currentPoint.slope, segment11.slope);

        const point11 = await getPoint(veARC, 11);
        expect(point11.bias).to.equal(currentPoint.bias);
        expect(point11.slope).to.equal(currentPoint.slope);
        expect(point11.timestamp).to.equal(startTime11);
        ARCBalance = stringMinus(ARCBalance, ARCAmount11);
        expect((await ARC.balanceOf(tester.address)).toString()).to.equal(ARCBalance);

        // check point
        let checkPoint = timestampStart + WEEK * 11;
        let checkPointEpoch = 12;
        currentPoint.bias = stringMinus(currentPoint.bias, stringMul(String(checkPoint - startTime11), currentPoint.slope));
        currentPoint.slope = stringMinus(currentPoint.slope, segment6.slope);
        currentPoint.slope = stringMinus(currentPoint.slope, segment7.slope);
        currentPoint.slope = stringMinus(currentPoint.slope, segment8.slope);
        
        // await ethers.provider.send('evm_setNextBlockTimestamp', [checkPoint]);
        // await veARC.connect(tester).checkPoint();

        // const point12 = await getPoint(veARC, 12);
        // expect(point12.bias).to.equal(currentPoint.bias);
        // expect(point12.slope).to.equal(currentPoint.slope);
        // expect(point12.timestamp).to.equal(checkPoint);

        // lock12
        const startTime12 = timestampStart + WEEK * 11 + Math.round(WEEK / 7 * 1);
        const unlockTime12 = timestampStart + WEEK * 20;
        const ARCAmount12 = decimalToUnDecimalStr(51);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime12]);
        await veARC.connect(tester).createLock(ARCAmount12, unlockTime12);
        const segment12 = getBiasAndSlope(ARCAmount12, unlockTime12 - startTime12, MAXTIME);
        
        currentPoint.bias = stringMinus(currentPoint.bias, stringMul(String(startTime12-checkPoint), currentPoint.slope));
        currentPoint.bias = stringAdd(currentPoint.bias, segment12.bias);
        currentPoint.slope = stringAdd(currentPoint.slope, segment12.slope);

        checkPointEpoch += 1;
        const point12 = await getPoint(veARC, checkPointEpoch);
        expect(point12.bias).to.equal(currentPoint.bias);
        expect(point12.slope).to.equal(currentPoint.slope);
        expect(point12.timestamp).to.equal(startTime12);
        ARCBalance = stringMinus(ARCBalance, ARCAmount12);
        expect((await ARC.balanceOf(tester.address)).toString()).to.equal(ARCBalance);

        // lock13
        const startTime13 = timestampStart + WEEK * 11 + Math.round(WEEK / 7 * 2);
        const unlockTime13 = timestampStart + WEEK * 30;
        const ARCAmount13 = decimalToUnDecimalStr(16);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime13]);
        await veARC.connect(tester).createLock(ARCAmount13, unlockTime13);
        const segment13 = getBiasAndSlope(ARCAmount13, unlockTime13 - startTime13, MAXTIME);
        
        currentPoint.bias = stringMinus(currentPoint.bias, stringMul(String(startTime13-startTime12), currentPoint.slope));
        currentPoint.bias = stringAdd(currentPoint.bias, segment13.bias);
        currentPoint.slope = stringAdd(currentPoint.slope, segment13.slope);

        checkPointEpoch += 1;
        const point13 = await getPoint(veARC, checkPointEpoch);
        expect(point13.bias).to.equal(currentPoint.bias);
        expect(point13.slope).to.equal(currentPoint.slope);
        expect(point13.timestamp).to.equal(startTime13);
        ARCBalance = stringMinus(ARCBalance, ARCAmount13);
        expect((await ARC.balanceOf(tester.address)).toString()).to.equal(ARCBalance);


        // lock14
        const startTime14 = timestampStart + WEEK * 11 + Math.round(WEEK / 7 * 3);
        const unlockTime14 = timestampStart + WEEK * 25;
        const ARCAmount14 = decimalToUnDecimalStr(6);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime14]);
        await veARC.connect(tester).createLock(ARCAmount14, unlockTime14);
        const segment14 = getBiasAndSlope(ARCAmount14, unlockTime14 - startTime14, MAXTIME);
        
        currentPoint.bias = stringMinus(currentPoint.bias, stringMul(String(startTime14-startTime13), currentPoint.slope));
        currentPoint.bias = stringAdd(currentPoint.bias, segment14.bias);
        currentPoint.slope = stringAdd(currentPoint.slope, segment14.slope);

        checkPointEpoch += 1;
        const point14 = await getPoint(veARC, checkPointEpoch);
        expect(point14.bias).to.equal(currentPoint.bias);
        expect(point14.slope).to.equal(currentPoint.slope);
        expect(point14.timestamp).to.equal(startTime14);
        ARCBalance = stringMinus(ARCBalance, ARCAmount14);
        expect((await ARC.balanceOf(tester.address)).toString()).to.equal(ARCBalance);


        // check point
        const checkPoint20 = timestampStart + WEEK * 20;
        currentPoint.bias = stringMinus(currentPoint.bias, stringMul(String(checkPoint20 - startTime14), currentPoint.slope));
        currentPoint.slope = stringMinus(currentPoint.slope, segment12.slope);
        currentPoint.slope = stringMinus(currentPoint.slope, segment11.slope);
        currentPoint.slope = stringMinus(currentPoint.slope, segment1.slope);
        checkPointEpoch += 1;

        // currentBlockNumber = await waitUntilJustBefore(checkPoint20);
        // await veARC.connect(tester).checkPoint();

        // const point15 = await getPoint(veARC, checkPointEpoch);
        // expect(point15.bias).to.equal(currentPoint.bias);
        // expect(point15.slope).to.equal(currentPoint.slope);
        // expect(point15.blk).to.equal(checkPoint20);

        // check point
        const checkPoint25 = timestampStart + WEEK * 25;
        currentPoint.bias = stringMinus(currentPoint.bias, stringMul(String(checkPoint25 - checkPoint20), currentPoint.slope));
        currentPoint.slope = stringMinus(currentPoint.slope, segment14.slope);
        currentPoint.slope = stringMinus(currentPoint.slope, segment10.slope);
        currentPoint.slope = stringMinus(currentPoint.slope, segment2.slope);
        checkPointEpoch += 1;

        // currentBlockNumber = await waitUntilJustBefore(checkPoint25);
        // await veARC.connect(tester).checkPoint();

        // const pointAt25 = await getPoint(veARC, checkPointEpoch);
        // expect(pointAt25.bias).to.equal(currentPoint.bias);
        // expect(pointAt25.slope).to.equal(currentPoint.slope);
        // expect(pointAt25.blk).to.equal(checkPoint25);

        // check point
        const checkPoint30 = timestampStart + WEEK * 30;
        currentPoint.bias = stringMinus(currentPoint.bias, stringMul(String(checkPoint30 - checkPoint25), currentPoint.slope));
        currentPoint.slope = stringMinus(currentPoint.slope, segment13.slope);
        currentPoint.slope = stringMinus(currentPoint.slope, segment3.slope);
        checkPointEpoch += 1;

        // check point
        const checkPoint32 = timestampStart + WEEK * 32;
        currentPoint.bias = stringMinus(currentPoint.bias, stringMul(String(checkPoint32 - checkPoint30), currentPoint.slope));
        
        await ethers.provider.send('evm_setNextBlockTimestamp', [checkPoint32]);
        await veARC.connect(tester).checkPoint();

        checkPointEpoch += 1;
        const pointAt32 = await getPoint(veARC, checkPointEpoch);
        expect(pointAt32.bias).to.equal(currentPoint.bias);
        expect(pointAt32.slope).to.equal(currentPoint.slope);
        expect(pointAt32.timestamp).to.equal(checkPoint32);

    });

});