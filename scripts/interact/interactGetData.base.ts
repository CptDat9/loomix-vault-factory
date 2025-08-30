import { ethers, deployments, getNamedAccounts } from "hardhat";
import { VaultFactory__factory, Vault__factory } from "../../typechain-types";
import { formatUnits } from "ethers";

async function main() {
  try {
    const { deployer } = await getNamedAccounts();
    const signer = await ethers.getSigner(deployer);
    console.log("Địa chỉ Deployer:", deployer);
    const vaultFactoryDeployment = await deployments.get("VaultFactory");
    const vaultFactory = VaultFactory__factory.connect(vaultFactoryDeployment.address, signer);
    console.log("Địa chỉ VaultFactory:", vaultFactoryDeployment.address);
    console.log("Vault implementation:", await vaultFactory.vaultImplementation());
    console.log("\n=== Danh sách Vaults từ Factory ===");
    const allVaultsParams = await vaultFactory.listAllVaultsWithParams();
    allVaultsParams.forEach((v, i) => {
      console.log(`\nVault #${i}`);
      console.log("  Agent Name:", v.agentName);
      console.log("  Asset:", v.asset);
      console.log("  Token Name:", v.tokenName);
      console.log("  Token Symbol:", v.tokenSymbol);
      console.log("  Profit Max Unlock Time:", v.profitMaxUnlockTime.toString());
      console.log("  Governance:", v.governance);
    });
    const vaultAddress = "0x77C1533A433FB626AdF6Ebedf8616e519520518d";
    console.log("\nVault được chọn:", vaultAddress);
    const vault = Vault__factory.connect(vaultAddress, signer);

    console.log("\n=== Danh sách Strategies của Vault ===");
    const defaultQueue = await vault.getDefaultQueue();
    console.log("Default Queue:", defaultQueue);

    for (const strategyAddress of defaultQueue) {
      const strategyData = await vault.strategies(strategyAddress);
      console.log(`\nThông tin Strategy: ${strategyAddress}`);
      console.log("  Active:", strategyData.activation);
      console.log("  Last Report:", strategyData.lastReport.toString());
      console.log("  Current Debt:", formatUnits(strategyData.currentDebt, 6), "USDC");
      console.log("  Max Debt:", formatUnits(strategyData.maxDebt, 6), "USDC");
    }
  } catch (err) {
    console.error("Lỗi:", err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Lỗi:", err);
  process.exit(1);
});
