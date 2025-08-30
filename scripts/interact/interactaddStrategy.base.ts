import { ethers, deployments, getNamedAccounts } from "hardhat";
import { VaultFactory__factory, Vault__factory, ERC20Mintable__factory } from "../../typechain-types";
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
    const usdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; //USDC BASE
    const usdc = ERC20Mintable__factory.connect(usdcAddress, signer);
    console.log("Địa chỉ USDC:", usdcAddress, "-", await usdc.name());
    const strategy1Address = "0xc0c5689e6f4D256E861F65465b691aeEcC0dEb12"; // Morpho Gauntlet
    const strategy2Address = "0x616a4E1db48e22028f6bbf20444Cd3b8e3273738"; // Morpho Seamless
//  const strategy3Address = "0xf42f5795D9ac7e9D757dB633D693cD548Cfd9169"; //Fluid
    console.log("Strategy 1:", strategy1Address);
    console.log("Strategy 2:", strategy2Address);
    const vaultAddress = "0x77C1533A433FB626AdF6Ebedf8616e519520518d";
    console.log("Vault được chọn:", vaultAddress);
    const vault = Vault__factory.connect(vaultAddress, signer);
    const vaultParamsData = await vaultFactory.getVault(0);
    console.log("\n=== Thông tin Vault ===");
    console.log("Agent Name:", vaultParamsData.agentName);
    console.log("Asset:", vaultParamsData.asset);
    console.log("Token Name:", vaultParamsData.tokenName);
    console.log("Token Symbol:", vaultParamsData.tokenSymbol);
    console.log("Profit Max Unlock Time:", vaultParamsData.profitMaxUnlockTime.toString());
    console.log("Governance:", vaultParamsData.governance);
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
