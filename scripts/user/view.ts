import hre from "hardhat";

import { deposit } from "../utils/helper";
import { Vault__factory } from "../../typechain-types";

async function main() {
  const { deployments, ethers } = hre;
  const { get } = deployments;
  const privateKey = process.env.USER_PRIVATE_KEY!;
  const wallet = new ethers.Wallet(privateKey, ethers.provider);
  let vault = Vault__factory.connect((await get("USDCVaultOnBase")).address, ethers.provider);
  let address = "0xEE6Eacc608A4524DF5Cb1a33CE7840139a8deA1A";

  let share = await vault.balanceOf(address);
  console.log("share", share);
  let asset = await vault.previewMint(share);
  console.log("asset", asset);

  let maxWithdraw = await vault["maxWithdraw(address)"](address);
  console.log("maxWithdraw", maxWithdraw);
  let maxWithdraw2 = await vault["maxWithdraw(address,uint256,address[])"](address, 100, []);
  console.log("withdraw2", maxWithdraw2);
  let data = await vault.vaultData();
  let totalDebt = data.totalDebt;
  let totalIdle = data.totalIdle;
  console.log(`total debt ${totalDebt}`);
  console.log(`total idle ${totalIdle}`);
  let queue1 = data.useDefaultQueue;
  console.log("useDefaultQueue", queue1);
  let queue2 = await vault.getDefaultQueue();
  console.log("dèault queue", queue2);
  let withdrawlimitModule = data.withdrawLimitModule;
  console.log("withdraw limit module", withdrawlimitModule);
}
main();
