import { ethers } from "hardhat";

async function main() {
  const proxyAddr = "0x77C1533A433FB626AdF6Ebedf8616e519520518d";
  const newImpl  = "0xaAD61D7Ee4E79D82D57C59C3a165066532CA5A44";

  const [deployer] = await ethers.getSigners();
    console.log("Using deployer:", deployer.address);
    const proxy = await ethers.getContractAt(
    [
      "function upgradeToAndCall(address newImplementation, bytes data) external payable",
      "function implementation() view returns (address)",
            "function pricePerShare() view returns (uint256)"

    ],
    proxyAddr,
    deployer
  );

  const tx = await proxy.upgradeToAndCall(newImpl, "0x");
  await tx.wait();
console.log(`Vault upgraded to: ${newImpl}`);

}
main().catch((e) => { console.error(e); process.exit(1); });
