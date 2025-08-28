// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/interfaces/IERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IVaultFactory {
    // Structs
    struct StrategyConfig {
        address strategy; // Địa chỉ của strategy
        bool addToQueue; // Có thêm vào default queue hay không
    }
    struct CreateVaultParams {
        string agentName;              // Agent name
        IERC20 asset;                  // Underlying asset
        string tokenName;              // ERC20 name of the vault
        string tokenSymbol;            // ERC20 symbol of the vault
        uint256 profitMaxUnlockTime;   // Max time to unlock profits
        address governance;            // Governance address for the vault
    }

    // Events
    event VaultCreated(
        string indexed agentName,
        address indexed creator,
        address vault,
        address asset
    );
    event StrategyAdded(address indexed vault, address indexed strategy, bool addToQueue);
    event VaultsRebalanced(address indexed fromVault, address indexed toVault, uint256 amount);

    // View Functions
    function getVault(uint256 index) external view returns (CreateVaultParams  memory);
    function listAllVaults() external view returns (address[] memory);
    function isVault(address vault) external view returns (bool);
    function listAllVaultsWithParams() external view returns (CreateVaultParams[] memory);
    // Functions
    function createVault(CreateVaultParams memory params) external returns (address vault);
    function addStrategy(address vault, address strategy, bool addToQueue) external;
    function rebalanceBetweenVaults(address fromVault, address toVault, uint256 targetDebt) external;
}