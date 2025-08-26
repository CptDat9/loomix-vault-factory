import hre from "hardhat";

import { deposit } from "../utils/helper";
import { Vault__factory } from "../../typechain-types";

async function main() {
  const { deployments, ethers } = hre;
  const { get } = deployments;
  const privateKey = process.env.USER_PRIVATE_KEY!;
  const wallet = new ethers.Wallet(privateKey, ethers.provider);
  let vault = Vault__factory.connect((await get("USDCVaultOnBase")).address, ethers.provider);
  let address = "0xd9Ecd48CFD89974C6EB997CBBa4d491A6c3A09D4";

  let share = await vault.balanceOf(address);
  console.log("share", share);
  let asset = await vault.convertToAssets(share);
  console.log("asset", asset);
}
main();
