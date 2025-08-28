
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
    const usdcDeployment = await deployments.get("USDC");
    const usdc = ERC20Mintable__factory.connect(usdcDeployment.address, signer);
    console.log("Địa chỉ USDC:", usdcDeployment.address, "-", await usdc.name());
    const mintAmount = parseUnits("10000", 6);
    console.log("Minting USDC...");
    await (await usdc.mint(deployer, mintAmount)).wait();
    console.log("Số dư USDC của Deployer:", formatUnits(await usdc.balanceOf(deployer), 6));
    const MockStrategyFactory = await ethers.getContractFactory("MockStrategy", signer);
    const strategy1 = await MockStrategyFactory.deploy();
    await strategy1.waitForDeployment();
    await (await strategy1.initialize(
      vaultFactoryDeployment.address,
      deployer,
      deployer,
      usdcDeployment.address,
      "Mock Strategy 1",
      "MS1"
    )).wait();
    const strategy1Address = await strategy1.getAddress();
    console.log("MockStrategy1 được triển khai tại:", strategy1Address);
    const strategy2 = await MockStrategyFactory.deploy();
    await strategy2.waitForDeployment();
    await (await strategy2.initialize(
      vaultFactoryDeployment.address,
      deployer,
      deployer,
      usdcDeployment.address,
      "Mock Strategy 2",
      "MS2"
    )).wait();
    const strategy2Address = await strategy2.getAddress();
    console.log("MockStrategy2 được triển khai tại:", strategy2Address);
    const vaultParams = {
      agentName: "TestPool",
      asset: usdcDeployment.address,
      tokenName: "Test Vault",
      tokenSymbol: "TVT",
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
    const vault = Vault__factory.connect(newVaultAddress, signer);
    console.log("Đang thêm strategies...");
    await (await vaultFactory.addStrategy(newVaultAddress, strategy1Address, true)).wait();
    console.log("Đã thêm Mock Strategy 1:", strategy1Address);
    await (await vaultFactory.addStrategy(newVaultAddress, strategy2Address, true)).wait();
    console.log("Đã thêm Mock Strategy 2:", strategy2Address);
    console.log("Đang kiểm tra tất cả vaults...");
    const allVaults = await vaultFactory.listAllVaults();
    console.log("Tất cả vaults:", allVaults);
    console.log("Kiểm tra vault đầu tiên:", await vaultFactory.getVault(0));
    console.log("Xác minh vault:", await vaultFactory.isVault(newVaultAddress));
    const depositAmount = parseUnits("1000", 6);
    const balance = await usdc.balanceOf(deployer);
    console.log("Số dư USDC của Deployer:", formatUnits(balance, 6));
    if (balance >= depositAmount) {
      console.log(`Đang phê duyệt ${formatUnits(depositAmount, 6)} USDC...`);
      await (await usdc.approve(newVaultAddress, depositAmount)).wait();
      console.log(`Đang nạp ${formatUnits(depositAmount, 6)} USDC...`);
      await (await vault.deposit(depositAmount, deployer)).wait();
      const vaultBal = await vault.balanceOf(deployer);
      console.log("Số dư token vault:", formatUnits(vaultBal, 6));
    } else {
      console.warn("Không đủ USDC để nạp");
    }
    console.log("Đang tạo vault thứ hai...");
    const vaultParams2 = {
      ...vaultParams,
      agentName: "TestPool2",
      tokenName: "Test Vault 2",
      tokenSymbol: "TVT2",
    };
    const tx2 = await vaultFactory.createVault(vaultParams2, { gasLimit: 3_000_000 });
    const receipt2 = await tx2.wait();
    const vaultCreatedEvent2 = receipt2.logs
      .map((log) => {
        try {
          return vaultFactory.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log?.name === "VaultCreated");
    if (!vaultCreatedEvent2) throw new Error("Sự kiện VaultCreated không tìm thấy cho vault thứ hai");
    const newVaultAddress2 = vaultCreatedEvent2.args.vault;
    console.log("Vault thứ hai được tạo tại:", newVaultAddress2);
    const vault2 = Vault__factory.connect(newVaultAddress2, signer);
    console.log(`Đang Approvet ${formatUnits(depositAmount, 6)} USDC cho vault thứ hai...`);
    await (await usdc.approve(newVaultAddress2, depositAmount)).wait();
    console.log(`Đang nạp ${formatUnits(depositAmount, 6)} USDC vào vault thứ hai...`);
    await (await vault2.deposit(depositAmount, deployer)).wait();
    console.log("Số dư token vault thứ hai:", formatUnits(await vault2.balanceOf(deployer), 6));
    console.log("Approve shares cho rebalance...");
    const shares = await vault.convertToShares(depositAmount);
    await (await vault.approve(vaultFactoryDeployment.address, shares)).wait();
    const targetAmount = parseUnits("500", 6);
    console.log(`Đang rebalance từ vault 1 sang vault 2 với target ${formatUnits(targetAmount, 6)} USDC...`);
    await (await vaultFactory.rebalanceBetweenVaults(newVaultAddress, newVaultAddress2, targetAmount)).wait();
    console.log("Rebalance hoàn tất");
    console.log("Số dư vault 1 sau rebalance:", formatUnits(await vault.totalAssets(), 6));
    console.log("Số dư vault 2 sau rebalance:", formatUnits(await vault2.totalAssets(), 6));
  } catch (err) {
    console.error("Lỗi:", err);
    process.exit(1);
  }
}
main().catch((err) => {
  console.error("Lỗi:", err);
  process.exit(1);
});