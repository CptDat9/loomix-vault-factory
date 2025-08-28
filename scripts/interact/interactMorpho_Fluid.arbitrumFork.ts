import { ethers, deployments, getNamedAccounts } from "hardhat";
import { VaultFactory__factory, Vault__factory, ERC20Mintable__factory } from "../../typechain-types";
import { parseUnits, formatUnits } from "ethers";
async function main() {
  try {
    const { deployer } = await getNamedAccounts();
    const signer = await ethers.getSigner(deployer);
    console.log("Địa chỉ Deployer:", deployer);
    const vaultFactoryDeployment = await deployments.get("VaultFactory");
    const vaultFactory = VaultFactory__factory.connect(vaultFactoryDeployment.address, signer);
    console.log("Địa chỉ VaultFactory:", vaultFactoryDeployment.address);
    console.log("Vault implementation:", await vaultFactory.vaultImplementation());
    const usdcAddress = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
    const usdc = ERC20Mintable__factory.connect(usdcAddress, signer);
    console.log("Địa chỉ USDC:", usdcAddress, "-", await usdc.name());
    const strategy1Address = "0x1A996cb54bb95462040408C06122D45D6Cdb6096"; // fluid
    const strategy2Address = "0x7e97fa6893871A2751B5fE961978DCCb2c201E65"; // morpho-gauntlet-usdc-core
    console.log("Strategy 1 (fluid):", strategy1Address);
    console.log("Strategy 2 (morpho-gauntlet-usdc-core):", strategy2Address);
    const vaultParams = {
      agentName: "TestPoolArbitrum",
      asset: usdcAddress,
      tokenName: "Test Vault Arbitrum",
      tokenSymbol: "TVTA",
      profitMaxUnlockTime: 7 * 24 * 60 * 60,
      governance: deployer,
    };
    console.log("Đang tạo vault...");
    const tx = await vaultFactory.createVault(vaultParams, { gasLimit: 3_000_000 });
    const receipt = await tx.wait();
    const vaultCreatedEvent = receipt.logs
      .map((log) => {
        try {
          return vaultFactory.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log?.name === "VaultCreated");
    if (!vaultCreatedEvent) throw new Error("Sự kiện VaultCreated không tìm thấy");
    const newVaultAddress = vaultCreatedEvent.args.vault;
    console.log("Vault được tạo tại:", newVaultAddress);
    const vault = Vault__factory.connect(newVaultAddress, signer); // kết nối với 1 vault đã tạo
    await (await vaultFactory.addStrategy(newVaultAddress, strategy1Address, true)).wait();
    console.log("Đã thêm Strategy 1 (fluid):", strategy1Address);
    await (await vaultFactory.addStrategy(newVaultAddress, strategy2Address, true)).wait();
    console.log("Đã thêm Strategy 2 (morpho-gauntlet-usdc-core):", strategy2Address);
    const vaultIndex = (await vaultFactory.listAllVaults()).length - 1;
    const vaultParamsData = await vaultFactory.getVault(vaultIndex);
    console.log("Agent Name:", vaultParamsData.agentName);
    console.log("Asset:", vaultParamsData.asset);
    console.log("Token Name:", vaultParamsData.tokenName);
    console.log("Token Symbol:", vaultParamsData.tokenSymbol);
    console.log("Profit Max Unlock Time:", vaultParamsData.profitMaxUnlockTime.toString());
    console.log("Governance:", vaultParamsData.governance);
    // Xem strategy
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