import { parseUnits } from "ethers";
import hre from "hardhat";
import { Vault__factory } from "../../typechain-types";
import { addStrategy, ROLES, setDebt, setMaxDebt, setRole } from "../utils/helper";
import { addresses } from "../../utils/address";

async function main() {
  const { deployments, ethers } = hre;
  const { get } = deployments;
  const privateKey = process.env.DEPLOYER!;
  const wallet = new ethers.Wallet(privateKey, ethers.provider);
  let vault = Vault__factory.connect((await get("USDCVaultOnBase")).address);

  let agent = "0xe8D0E2D9e58ACCCca71Bee3383411F3f67cf3327";
  await setRole(await vault.getAddress(), agent, ROLES.REPORTING_MANAGER, wallet);
}
main();
