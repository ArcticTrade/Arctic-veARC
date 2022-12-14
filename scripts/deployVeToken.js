const hardhat = require("hardhat");
const contracts = require("./deployed.js");
const BigNumber = require("bignumber.js");

// example
// HARDHAT_NETWORK='izumiTest' \
//     node deployveToken.js 0xD4D6F030520649c7375c492D37ceb56571f768D0 0.1 18 14909 20000 name symbl
const v = process.argv
const net = process.env.HARDHAT_NETWORK


var para = {
    rewardProvider: v[2],
    rewardPerBlockDecimal: v[3],
    rewardTokenDecimal: v[4],
    startBlock: v[5],
    endBlock: v[6],
    name: v[7],
    symbol: v[8],
}


async function main() {
    
  const [deployer] = await hardhat.ethers.getSigners();

  const veTokenFactory = await hardhat.ethers.getContractFactory("veToken");

  console.log("Paramters: ");
  for ( var i in para) { console.log("    " + i + ": " + para[i]); }

  console.log("Deploying .....");

  const arc = contracts[net].ARC;

  console.log('arc: ', arc);

  const rewardPerBlockNoDecimal = BigNumber(para.rewardPerBlockDecimal).times(10 ** Number(para.rewardTokenDecimal)).toFixed(0);

  const args = [
    arc, 
    {
      provider: para.rewardProvider,
      accRewardPerShare: 0,
      rewardPerBlock: rewardPerBlockNoDecimal,
      lastTouchBlock: 0,
      startBlock: para.startBlock,
      endBlock: para.endBlock,
    },
    para.name,
    para.symbol
  ]

  console.log('args: ', args);

  const veToken = await veTokenFactory.deploy(...args);
  await veToken.deployed();

  console.log("veToken Contract Address: " , veToken.address);

}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });