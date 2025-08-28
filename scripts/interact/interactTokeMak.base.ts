import { ethers, deployments, getNamedAccounts } from "hardhat";
import { VaultFactory__factory, Vault__factory, ERC20Mintable__factory } from "../../typechain-types";
import { parseUnits, formatUnits } from "ethers";
async function main() {
    try {
        const { deployer } = await getNamedAccounts();
        const signer = await ethers.getSigner(deployer);
        const vaultFactoryDeployment = await deployments.get("VaultFactory");
        const vaultFactory = VaultFactory__factory.connect(vaultFactoryDeployment.address, signer);
        console.log("Địa chỉ VaultFactory:", vaultFactoryDeployment.address);
        console.log("Vault implementation:", await vaultFactory.vaultImplementation());
        const usdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
        const usdc = ERC20Mintable__factory.connect(usdcAddress, signer);
        console.log("Địa chỉ USDC (BASE):", usdcAddress, "-", await usdc.name());
        const TokeMakStrategyAddress = "0x9c6864105AEC23388C89600046213a44C384c831";
        console.log("TokeMak AutoPools (BASE): ", TokeMakStrategyAddress);
        const vaultParams = {
            agentName: "AgentBaseUSDC",
            asset: usdcAddress,
            tokenName: "Test Vault Base",
            tokenSymbol: "TVB",
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
        await (await vaultFactory.addStrategy(newVaultAddress, TokeMakStrategyAddress, true)).wait();
        const vaultIndex = (await vaultFactory.listAllVaults()).length - 1;
        const vaultParamsData = await vaultFactory.getVault(vaultIndex);
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
        console.error("ERR: ", err);
        process.exit(1);
    }
}
main().catch((err) => {
  console.error("Lỗi:", err);
  process.exit(1);
});