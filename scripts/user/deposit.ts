import hre from "hardhat";

import { deposit } from "../utils/helper";
import { Vault__factory } from "../../typechain-types";

async function main() {
  const { deployments, ethers } = hre;
  const { get } = deployments;
  const privateKey = process.env.USER_PRIVATE_KEY!;
  const wallet = new ethers.Wallet(privateKey, ethers.provider);
  let vault = Vault__factory.connect((await get("USDCVaultOnBase")).address, ethers.provider);
  let maxDeposit = await vault.maxDeposit(wallet.address);

  console.log(` max Deposit = ${maxDeposit}`);

  await deposit(await vault.getAddress(), ethers.parseUnits("1", 6), wallet);
}
main();
