import { ethers, deployments, getNamedAccounts } from "hardhat";
import { VaultFactory__factory, Vault__factory, ERC20Mintable__factory } from "../../typechain-types";
import { formatUnits, parseUnits } from "ethers";

async function main() {
  try {
    // Lấy thông tin deployer và signer
    const { deployer } = await getNamedAccounts();
    const signer = await ethers.getSigner(deployer);
    console.log("Địa chỉ Deployer:", deployer);
    const vaultFactoryAddress = "0x62adaaaB3fA18a2b867cE2Fb9EF9d704506BdD5c";
    const vaultFactory = VaultFactory__factory.connect(vaultFactoryAddress, signer);
    console.log("Địa chỉ VaultFactory:", vaultFactoryAddress);
    const usdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC BASE
    const usdc = ERC20Mintable__factory.connect(usdcAddress, signer);
    const strategy1Address = "0xc0c5689e6f4D256E861F65465b691aeEcC0dEb12"; // Morpho Gauntlet
    const strategy2Address = "0x616a4E1db48e22028f6bbf20444Cd3b8e3273738"; // Morpho Seamless
    console.log("Địa chỉ USDC:", usdcAddress, "-", await usdc.name());
    console.log("Strategy 1 (Morpho Gauntlet):", strategy1Address);
    console.log("Strategy 2 (Morpho Seamless):", strategy2Address);
    const userBalance = await usdc.balanceOf(deployer);
    console.log("User USDC Balance:", formatUnits(userBalance, 6), "USDC");
    // if (userBalance < parseUnits("0", 6)) {
    //   throw new Error("Không đủ USDC balance ");
    // }
    const vaultParams = {
      agentName: "TestPool",
      asset: usdcAddress,
      tokenName: "Test Vault",
      tokenSymbol: "TVT",
      profitMaxUnlockTime: 7 * 24 * 60 * 60, // 7 ngày
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
    const vault = Vault__factory.connect(newVaultAddress, signer);
    console.log("Thêm Strategy 1 (Morpho Gauntlet)...");
    await vaultFactory.addStrategy(newVaultAddress, strategy1Address, true, { gasLimit: 1_000_000 });
    console.log("Thêm Strategy 2 (Morpho Seamless)...");
    await vaultFactory.addStrategy(newVaultAddress, strategy2Address, true, { gasLimit: 1_000_000 });
    let defaultQueue = await vault.getDefaultQueue();
    console.log("Default Queue sau khi thêm strategies:", defaultQueue);

    const newQueue = [strategy2Address, strategy1Address];
    console.log("Cập nhật Default Queue:", newQueue);
    await vault.setDefaultQueue(newQueue, { gasLimit: 1_000_000 });
    defaultQueue = await vault.getDefaultQueue();
    console.log("Default Queue sau khi cập nhật:", defaultQueue);

    console.log("Gọi processReport cho Strategy 1...");
    await vault.processReport(strategy1Address, { gasLimit: 2_000_000 });
    console.log("processReport hoàn tất");
    const targetDebt = parseUnits("100", 6); // Ví dụ: Đặt target debt là 100 USDC
    console.log("Cập nhật debt cho Strategy 1 (Morpho Gauntlet) với target:", formatUnits(targetDebt, 6), "USDC");
    await vault.updateDebt(strategy1Address, targetDebt, 0, { gasLimit: 2_000_000 });
    console.log("Debt được cập nhật");
    const depositAmount = parseUnits("100", 6); // Deposit 100 USDC
    console.log("Phê duyệt USDC cho Vault...");
    await usdc.approve(newVaultAddress, depositAmount, { gasLimit: 1_000_000 });
    console.log("Thực hiện deposit", formatUnits(depositAmount, 6), "USDC...");
    await vault.deposit(depositAmount, deployer, { gasLimit: 2_000_000 });
    console.log("Deposit hoàn tất");
    const strategyData = await vault.strategies(strategy2Address);
    console.log("\n=== Kiểm tra Strategy đầu tiên (Morpho Seamless) sau deposit ===");
    console.log("Current Debt:", formatUnits(strategyData.currentDebt, 6), "USDC");
    console.log("Max Debt:", formatUnits(strategyData.maxDebt, 6), "USDC");
    const totalAssets = await vault.totalAssets();
    const totalDebt = await vault.totalDebt();
    console.log("\n=== Trạng thái Vault ===");
    console.log("Total Assets:", formatUnits(totalAssets, 6), "USDC");
    console.log("Total Debt:", formatUnits(totalDebt, 6), "USDC");

  } catch (err) {
    console.error("Lỗi:", err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Lỗi:", err);
  process.exit(1);
});