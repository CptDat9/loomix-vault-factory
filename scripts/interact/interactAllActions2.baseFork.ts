import { ethers, deployments, getNamedAccounts } from "hardhat";
import { VaultFactory__factory, Vault__factory, ERC20Mintable__factory } from "../../typechain-types";
import { formatUnits, parseUnits } from "ethers";

async function printStrategyInfo(vault: any, strategyAddress: string, strategyName: string) {
  const strategyData = await vault.strategies(strategyAddress);
  console.log(`\n=== Thông tin Strategy: ${strategyName} (${strategyAddress}) ===`);
  console.log("Activation:", strategyData.activation.toString());
  console.log("Last Report:", strategyData.lastReport.toString());
  console.log("Current Debt:", formatUnits(strategyData.currentDebt, 6), "USDC");
  console.log("Max Debt:", formatUnits(strategyData.maxDebt, 6), "USDC");
}

async function printVaultState(vault: any, vaultAddress: string) {
  const totalAssets = await vault.totalAssets();
  const totalDebt = await vault.totalDebt();
  const totalIdle = await vault.totalIdle();
  const defaultQueue = await vault.getDefaultQueue();
  console.log("\n=== Trạng thái Vault:", vaultAddress, "===");
  console.log("Total Assets:", formatUnits(totalAssets, 6), "USDC");
  console.log("Total Debt:", formatUnits(totalDebt, 6), "USDC");
  console.log("Total Idle:", formatUnits(totalIdle, 6), "USDC");
  console.log("Default Queue:", defaultQueue);
}

async function main() {
  try {
    // Lấy thông tin deployer và signer
    const { deployer } = await getNamedAccounts();
    const signer = await ethers.getSigner(deployer);
    console.log("Địa chỉ Deployer:", deployer);

    // Kết nối với VaultFactory
    const vaultFactoryAddress = "0x62adaaaB3fA18a2b867cE2Fb9EF9d704506BdD5c";
    const vaultFactory = VaultFactory__factory.connect(vaultFactoryAddress, signer);
    console.log("Địa chỉ VaultFactory:", vaultFactoryAddress);

    // Địa chỉ USDC và 2 strategies
    const usdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    const usdc = ERC20Mintable__factory.connect(usdcAddress, signer);
    const strategyA = "0xc0c5689e6f4D256E861F65465b691aeEcC0dEb12"; // Morpho Gauntlet (A)
    const strategyB = "0x616a4E1db48e22028f6bbf20444Cd3b8e3273738"; // Morpho Seamless (B)
    console.log("Địa chỉ USDC:", usdcAddress, "-", await usdc.name());
    console.log("Strategy A (Morpho Gauntlet):", strategyA);
    console.log("Strategy B (Morpho Seamless):", strategyB);
    const userBalance = await usdc.balanceOf(deployer);
    console.log("User USDC Balance:", formatUnits(userBalance, 6), "USDC");
    if (userBalance < parseUnits("200", 6)) {
      throw new Error("Không đủ USDC balance (cần ít nhất 200 USDC)");
    }    const vaultParams = {
      agentName: "TestPoolTwoStrategies",
      asset: usdcAddress,
      tokenName: "Test Vault",
      tokenSymbol: "TV2",
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
    const ROLE_DEBT_MANAGER = "0x4087820ac4f3f365dd6666f75a18a95ae63ded871b765505dc50ff63b8b8ad7a";
    const hasRole = await vault.hasRole(ROLE_DEBT_MANAGER, deployer);
    console.log("User có role DEBT_MANAGER:", hasRole);
    console.log("Thêm Strategy A (Morpho Gauntlet)...");
    await vaultFactory.addStrategy(newVaultAddress, strategyA, true, { gasLimit: 1_000_000 });
    console.log("Thêm Strategy B (Morpho Seamless)...");
    await vaultFactory.addStrategy(newVaultAddress, strategyB, true, { gasLimit: 1_000_000 });
    await printVaultState(vault, newVaultAddress);
    await printStrategyInfo(vault, strategyA, "A - Morpho Gauntlet");
    await printStrategyInfo(vault, strategyB, "B - Morpho Seamless");
    const maxDebt = parseUnits("1000", 6);
    console.log("Cập nhật maxDebt cho Strategy A thành 1000 USDC...");
    await vault.updateMaxDebtForStrategy(strategyA, maxDebt, { gasLimit: 1_000_000 });
    console.log("Cập nhật maxDebt cho Strategy B thành 1000 USDC...");
    await vault.updateMaxDebtForStrategy(strategyB, maxDebt, { gasLimit: 1_000_000 });
    console.log("MaxDebt được cập nhật");
    await printStrategyInfo(vault, strategyA, "A - Morpho Gauntlet");
    await printStrategyInfo(vault, strategyB, "B - Morpho Seamless");
    console.log("Bật auto allocate...");
    await vault.setAutoAllocate(true, { gasLimit: 1_000_000 });
    console.log("Auto allocate đã được bật");
    // Bước 5: Deposit 100 USDC (tự động vào A do autoAllocate được bật)
    let depositAmount = parseUnits("100", 6);
    console.log("Phê duyệt USDC cho Vault (100 USDC)...");
    await usdc.approve(newVaultAddress, depositAmount, { gasLimit: 1_000_000 });
    console.log("Thực hiện deposit 100 USDC...");
    await vault.deposit(depositAmount, deployer, { gasLimit: 2_000_000 });
    console.log("Deposit hoàn tất");
    await printVaultState(vault, newVaultAddress);
    await printStrategyInfo(vault, strategyA, "A - Morpho Gauntlet");
    await printStrategyInfo(vault, strategyB, "B - Morpho Seamless");
    console.log("Gọi processReport cho Strategy A...");
    let txProcess = await vault.processReport(strategyA, { gasLimit: 2_000_000 });
    let receiptProcess = await txProcess.wait();
    let reportEventA = receiptProcess.logs
      .map((log) => {
        try {
          return vault.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log?.name === "StrategyReported");
    console.log(
      "Kết quả processReport cho A:",
      reportEventA
        ? `Gain: ${formatUnits(reportEventA.args.gain, 6)} USDC, Loss: ${formatUnits(reportEventA.args.loss, 6)} USDC`
        : "Không tìm thấy sự kiện StrategyReported"
    );
    await printVaultState(vault, newVaultAddress);
    await printStrategyInfo(vault, strategyA, "A - Morpho Gauntlet");
    const halfDebt = parseUnits("50", 6);
    console.log("Cập nhật debt cho A thành 50 USDC...");
    let txUpdateA = await vault.updateDebt(strategyA, halfDebt, 0, { gasLimit: 2_000_000 });
    let receiptUpdateA = await txUpdateA.wait();
    let debtEventA = receiptUpdateA.logs
      .map((log) => {
        try {
          return vault.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log?.name === "DebtUpdated");
    console.log(
      "Debt thực tế cho A:",
      debtEventA ? formatUnits(debtEventA.args.currentDebt, 6) : "Không tìm thấy sự kiện DebtUpdated",
      "USDC"
    );

    console.log("Cập nhật debt cho B thành 50 USDC...");
    let txUpdateB = await vault.updateDebt(strategyB, halfDebt, 0, { gasLimit: 2_000_000 });
    let receiptUpdateB = await txUpdateB.wait();
    let debtEventB = receiptUpdateB.logs
      .map((log) => {
        try {
          return vault.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log?.name === "DebtUpdated");
    console.log(
      "Debt thực tế cho B:",
      debtEventB ? formatUnits(debtEventB.args.currentDebt, 6) : "Không tìm thấy sự kiện DebtUpdated",
      "USDC"
    );
    await printVaultState(vault, newVaultAddress);
    await printStrategyInfo(vault, strategyA, "A - Morpho Gauntlet");
    await printStrategyInfo(vault, strategyB, "B - Morpho Seamless");
    //ProcessReport cho A và B 
    console.log("Gọi processReport cho Strategy A...");
    txProcess = await vault.processReport(strategyA, { gasLimit: 2_000_000 });
    receiptProcess = await txProcess.wait();
    reportEventA = receiptProcess.logs
      .map((log) => {
        try {
          return vault.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log?.name === "StrategyReported");
    console.log(
      "Kết quả processReport cho A:",
      reportEventA
        ? `Gain: ${formatUnits(reportEventA.args.gain, 6)} USDC, Loss: ${formatUnits(reportEventA.args.loss, 6)} USDC`
        : "Không tìm thấy sự kiện StrategyReported"
    );
    console.log("Gọi processReport cho Strategy B...");
    txProcess = await vault.processReport(strategyB, { gasLimit: 2_000_000 });
    receiptProcess = await txProcess.wait();
    let reportEventB = receiptProcess.logs
      .map((log) => {
        try {
          return vault.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log?.name === "StrategyReported");
    console.log(
      "Kết quả processReport cho B:",
      reportEventB
        ? `Gain: ${formatUnits(reportEventB.args.gain, 6)} USDC, Loss: ${formatUnits(reportEventB.args.loss, 6)} USDC`
        : "Không tìm thấy sự kiện StrategyReported"
    );
    await printVaultState(vault, newVaultAddress);
    await printStrategyInfo(vault, strategyA, "A - Morpho Gauntlet");
    await printStrategyInfo(vault, strategyB, "B - Morpho Seamless");
    //Cập nhật queue thành B, A
    const newQueue = [strategyB, strategyA];
    console.log("Cập nhật Default Queue mới:", newQueue);
    await vault.setDefaultQueue(newQueue, { gasLimit: 1_000_000 });
    await printVaultState(vault, newVaultAddress);
    //Rebalance: ProcessReport lại, rút từ A, thêm vào B
    console.log("Gọi processReport cho Strategy A trước rebalance...");
    txProcess = await vault.processReport(strategyA, { gasLimit: 2_000_000 });
    receiptProcess = await txProcess.wait();
    reportEventA = receiptProcess.logs
      .map((log) => {
        try {
          return vault.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log?.name === "StrategyReported");
    console.log(
      "Kết quả processReport cho A trước rebalance:",
      reportEventA
        ? `Gain: ${formatUnits(reportEventA.args.gain, 6)} USDC, Loss: ${formatUnits(reportEventA.args.loss, 6)} USDC`
        : "Không tìm thấy sự kiện StrategyReported"
    );
    console.log("Gọi processReport cho Strategy B trước rebalance...");
    txProcess = await vault.processReport(strategyB, { gasLimit: 2_000_000 });
    receiptProcess = await txProcess.wait();
    reportEventB = receiptProcess.logs
      .map((log) => {
        try {
          return vault.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log?.name === "StrategyReported");
    console.log(
      "Kết quả processReport cho B trước rebalance:",
      reportEventB
        ? `Gain: ${formatUnits(reportEventB.args.gain, 6)} USDC, Loss: ${formatUnits(reportEventB.args.loss, 6)} USDC`
        : "Không tìm thấy sự kiện StrategyReported"
    );
    console.log("Rút debt từ A (set target=0)...");
    txUpdateA = await vault.updateDebt(strategyA, 0, 0, { gasLimit: 2_000_000 });
    receiptUpdateA = await txUpdateA.wait();
    debtEventA = receiptUpdateA.logs
      .map((log) => {
        try {
          return vault.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log?.name === "DebtUpdated");
    console.log(
      "Debt thực tế sau khi rút từ A:",
      debtEventA ? formatUnits(debtEventA.args.currentDebt, 6) : "Không tìm thấy sự kiện DebtUpdated",
      "USDC"
    );
    console.log("Thêm debt vào B (set target=100)...");
    txUpdateB = await vault.updateDebt(strategyB, parseUnits("100", 6), 0, { gasLimit: 2_000_000 });
    receiptUpdateB = await txUpdateB.wait();
    debtEventB = receiptUpdateB.logs
      .map((log) => {
        try {
          return vault.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log?.name === "DebtUpdated");
    console.log(
      "Debt thực tế cho B sau rebalance:",
      debtEventB ? formatUnits(debtEventB.args.currentDebt, 6) : "Không tìm thấy sự kiện DebtUpdated",
      "USDC"
    );
    await printVaultState(vault, newVaultAddress);
    await printStrategyInfo(vault, strategyA, "A - Morpho Gauntlet");
    await printStrategyInfo(vault, strategyB, "B - Morpho Seamless");
    depositAmount = parseUnits("50", 6);
    console.log("Phê duyệt USDC cho Vault (50 USDC)...");
    await usdc.approve(newVaultAddress, depositAmount, { gasLimit: 1_000_000 });
    console.log("Thực hiện deposit thêm 50 USDC...");
    await vault.deposit(depositAmount, deployer, { gasLimit: 2_000_000 });
    console.log("Deposit thêm hoàn tất");
    await printVaultState(vault, newVaultAddress);
    await printStrategyInfo(vault, strategyA, "A - Morpho Gauntlet");
    await printStrategyInfo(vault, strategyB, "B - Morpho Seamless");
    console.log("Gọi processReport cho Strategy B sau rebalance...");
    txProcess = await vault.processReport(strategyB, { gasLimit: 2_000_000 });
    receiptProcess = await txProcess.wait();
    reportEventB = receiptProcess.logs
      .map((log) => {
        try {
          return vault.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log?.name === "StrategyReported");
    console.log(
      "Kết quả processReport cho B sau rebalance:",
      reportEventB
        ? `Gain: ${formatUnits(reportEventB.args.gain, 6)} USDC, Loss: ${formatUnits(reportEventB.args.loss, 6)} USDC`
        : "Không tìm thấy sự kiện StrategyReported"
    );
    await printVaultState(vault, newVaultAddress);
    await printStrategyInfo(vault, strategyB, "B - Morpho Seamless");
    printStrategyInfo(vault, strategyA, "A - Morpho Gauntless");
  } catch (err) {
    console.error("Lỗi:", err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Lỗi:", err);
  process.exit(1);
});