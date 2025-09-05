import { ethers } from "hardhat";
import SwapRouterABI from "./abi/SwapRouter.json";

const WETH = "0x4200000000000000000000000000000000000006";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const SWAP_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481";
const POOL = "0x6c561B446416E1A00E8E93E221854d6eA4171372";

async function main() {
  const [signer] = await ethers.getSigners();

  // WETH contract (chỉ cần approve, deposit, balanceOf)
  const weth = await ethers.getContractAt(
    [
      "function approve(address spender, uint256 amount) external returns (bool)",
      "function deposit() external payable",
      "function balanceOf(address account) external view returns (uint256)"
    ],
    WETH,
    signer
  );

  const router = new ethers.Contract(SWAP_ROUTER, SwapRouterABI, signer);



  const balanceWETH = await weth.balanceOf(signer.address);
  console.log("WETH Balance:", ethers.formatEther(balanceWETH));
  const UNISWAP_FACTORY = "0x33128a8fc17869897dce68ed026d694621f6fdfd"; // Base Uniswap V3 Factory

const factory = await ethers.getContractAt(
  ["function getPool(address, address, uint24) view returns (address)"],
  UNISWAP_FACTORY,
  signer
);

const pool500 = await factory.getPool(WETH, USDC, 500);
const pool3000 = await factory.getPool(WETH, USDC, 3000);
const pool100 = await factory.getPool(WETH, USDC, 100);

console.log("Pool 0.05%:", pool500);
console.log("Pool 0.3% :", pool3000);
console.log("Pool 0.01%:", pool100);

  const usdc = await ethers.getContractAt(
    ["function balanceOf(address) view returns (uint256)"],
    USDC,
    signer
  );

  const wethBal = await weth.balanceOf(POOL);
  const usdcBal = await usdc.balanceOf(POOL);
  const usdcUserBal = await usdc.balanceOf(signer.address);
  console.log("User bal (USDC):", parseInt(usdcBal, 6));
  console.log("Pool:", POOL);
  console.log("WETH in pool:", ethers.formatEther(wethBal));
  console.log("USDC in pool:", ethers.formatUnits(usdcBal, 6));
  // approve cho router
  const approveTx = await weth.approve(SWAP_ROUTER, balanceWETH);
  await approveTx.wait();
  const amountIn = ethers.parseEther("0.5");

  // chuẩn bị params swap
  const params = {
    tokenIn: WETH,
    tokenOut: USDC,
    fee: 500, // pool fee: 0.05%
    recipient: signer.address,
    deadline: Math.floor(Date.now() / 1000) + 60 * 10,
    amountIn: amountIn,
    amountOutMinimum: 1,
    sqrtPriceLimitX96: 0
  };

  console.log("Swapping 1 WETH -> USDC...");
  const tx = await router.exactInputSingle(params, { gasLimit: 2_000_000 });
  const receipt = await tx.wait();

  console.log("Swap successful, tx hash:", receipt.transactionHash);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
