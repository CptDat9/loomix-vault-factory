// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {DataTypes} from "../types/DataTypes.sol";
import {Constants} from "../Constants.sol";
import {ERC20Logic} from "./ERC20Logic.sol";
import {ERC4626Logic} from "./ERC4626Logic.sol";
import {UnlockSharesLogic} from "./UnlockSharesLogic.sol";
import {WithdrawFromStrategyLogic} from "./internal/WithdrawFromStrategyLogic.sol";
import {UnrealisedLossesLogic} from "./internal/UnrealisedLossesLogic.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IVault} from "../../../interfaces/IVault.sol";
import {IStrategy} from "../../../interfaces/IStrategy.sol";
import {IAccountant} from "../../../interfaces/IAccountant.sol";

library DebtLogic {
    using ERC20Logic for DataTypes.VaultData;
    using ERC4626Logic for DataTypes.VaultData;
    using UnlockSharesLogic for DataTypes.VaultData;

    using SafeERC20 for IERC20;

    function ExecuteProcessReport(
        DataTypes.VaultData storage vault,
        address strategy
    ) external returns (uint256 gain, uint256 loss) {
        require(
            vault.strategies[strategy].activation != 0,
            "Inactive strategy"
        );
        address asset = vault.asset();
        uint256 totalAssets;
        uint256 currentDebt;

        if (strategy != address(this)) {
            require(
                vault.strategies[strategy].activation != 0,
                "Inactive strategy"
            );
            uint256 strategyShares = IStrategy(strategy).balanceOf(
                address(this)
            );
            totalAssets = IStrategy(strategy).convertToAssets(strategyShares);
            currentDebt = vault.strategies[strategy].currentDebt;
        } else {
            totalAssets = IERC20(asset).balanceOf(address(this));
            currentDebt = vault.totalIdle;
        }
        if (totalAssets > currentDebt) {
            gain = totalAssets - currentDebt;
        } else {
            loss = currentDebt - totalAssets;
        }
        uint256 performanceFee;
        uint256 refund;
        if (vault.accountant != address(0)) {
            (performanceFee, refund) = IAccountant(vault.accountant).report(
                strategy,
                gain,
                loss
            );
            refund = Math.min(
                refund,
                Math.min(
                    IERC20(asset).balanceOf(vault.accountant),
                    IERC20(asset).allowance(vault.accountant, address(this))
                )
            );
        }
        uint256 performanceFeeShares;
        uint256 sharesToBurn;

        if (loss + performanceFee > 0) {
            sharesToBurn = vault.convertToShares(
                loss + performanceFee,
                Math.Rounding.Ceil
            );
            if (performanceFee > 0) {
                performanceFeeShares =
                    (sharesToBurn * performanceFee) /
                    (loss + performanceFee);
            }
        }
        uint256 sharesToLock;
        if (gain + refund > 0 && vault.profitMaxUnlockTime != 0) {
            sharesToLock = vault.convertToShares(
                gain + refund,
                Math.Rounding.Floor
            );
        }

        uint256 totalSupply = vault.totalSupply();
        uint256 unlockShares = vault.unlockShares();
        uint256 endingSupply = totalSupply + sharesToLock - sharesToBurn;

        // mint reward
        if (endingSupply > totalSupply + unlockShares) {
            vault._mint(
                address(this),
                endingSupply - totalSupply - unlockShares
            );
        }
        // burn reward
        uint256 totalLockedShares = vault.balanceOf(address(this));

        if (totalSupply + unlockShares > endingSupply) {
            uint256 toBurn = Math.min(
                totalSupply + unlockShares - endingSupply,
                totalLockedShares
            );
            vault._burn(address(this), toBurn);
        }

        if (sharesToLock > sharesToBurn) {
            sharesToLock -= sharesToBurn;
        } else {
            sharesToLock = 0;
        }

        if (refund > 0) {
            IERC20(vault.asset()).safeTransferFrom(
                vault.accountant,
                address(this),
                refund
            );
            vault.totalIdle += refund;
        }
        if (gain > 0) {
            currentDebt += gain;
            if (strategy != address(this)) {
                vault.strategies[strategy].currentDebt = currentDebt;
                vault.totalDebt += gain;
            } else {
                currentDebt += refund;
                vault.totalIdle = currentDebt;
            }
        }

        if (loss > 0) {
            currentDebt -= loss;
            if (strategy != address(this)) {
                vault.strategies[strategy].currentDebt = currentDebt;
                vault.totalDebt -= loss;
            } else {
                currentDebt += refund;
                vault.totalIdle = currentDebt;
            }
        }
        if (performanceFeeShares > 0) {
            vault._mint(vault.accountant, performanceFeeShares);
        }

        // Update unlocking rate and time to fully unlocked.
        totalLockedShares = vault.balanceOf(address(this));
        if (totalLockedShares > 0) {
            uint256 previouslyLockedTime;
            if (vault.fullProfitUnlockDate > block.timestamp) {
                previouslyLockedTime =
                    (totalLockedShares - sharesToLock) *
                    (vault.fullProfitUnlockDate - block.timestamp);
            }
            uint256 newProfitLockingPeriod = (previouslyLockedTime +
                sharesToLock *
                vault.profitMaxUnlockTime) / totalLockedShares;
            vault.profitUnlockingRate =
                (totalLockedShares * Constants.MAX_BPS_EXTENDED) /
                newProfitLockingPeriod;
            vault.fullProfitUnlockDate =
                block.timestamp +
                newProfitLockingPeriod;
            vault.lastProfitUpdate = block.timestamp;
        } else {
            vault.fullProfitUnlockDate = 0;
        }

        vault.strategies[strategy].lastReport = block.timestamp;
        if (
            loss + performanceFee > gain + refund ||
            vault.profitMaxUnlockTime == 0
        ) {
            performanceFee = vault.convertToAssets(
                performanceFeeShares,
                Math.Rounding.Floor
            );
        }
        emit IVault.StrategyReported(
            strategy,
            gain,
            loss,
            currentDebt,
            performanceFee,
            refund
        );
        return (gain, loss);
    }

    function ExecuteUpdateDebt(
        DataTypes.VaultData storage vault,
        address strategy,
        uint256 targetDebt,
        uint256 maxLoss
    ) external returns (uint256) {
        require(
            vault.strategies[strategy].activation != 0,
            "Inactive strategy"
        );

        uint256 currentDebt = vault.strategies[strategy].currentDebt;
        require(targetDebt != currentDebt, "No debt change");

        if (currentDebt > targetDebt) {
            uint256 assetsToWithdraw = currentDebt - targetDebt;
            if (vault.totalIdle + assetsToWithdraw < vault.minimumTotalIdle) {
                assetsToWithdraw = vault.minimumTotalIdle > vault.totalIdle
                    ? vault.minimumTotalIdle - vault.totalIdle
                    : 0;
                assetsToWithdraw = Math.min(assetsToWithdraw, currentDebt);
            }

            uint256 withdrawable = IStrategy(strategy).convertToAssets(
                IStrategy(strategy).maxRedeem(address(this))
            );

            assetsToWithdraw = Math.min(assetsToWithdraw, withdrawable);
            require(
                UnrealisedLossesLogic._assessShareOfUnrealisedLosses(
                    strategy,
                    currentDebt,
                    assetsToWithdraw
                ) == 0,
                "Unrealised losses"
            );

            if (assetsToWithdraw == 0) return currentDebt;

            uint256 preBalance = IERC20(vault.asset()).balanceOf(address(this));
            WithdrawFromStrategyLogic._withdrawFromStrategy(
                vault,
                strategy,
                assetsToWithdraw
            );
            uint256 postBalance = IERC20(vault.asset()).balanceOf(
                address(this)
            );
            uint256 withdrawn = Math.min(postBalance - preBalance, currentDebt);

            if (withdrawn < assetsToWithdraw && maxLoss < Constants.MAX_BPS) {
                require(
                    (assetsToWithdraw - withdrawn) <=
                        (assetsToWithdraw * maxLoss) / Constants.MAX_BPS,
                    "Too much loss"
                );
            } else if (withdrawn > assetsToWithdraw) {
                assetsToWithdraw = withdrawn;
            }

            vault.totalIdle += withdrawn;
            vault.totalDebt -= assetsToWithdraw;
            uint256 newDebt = currentDebt - assetsToWithdraw;

            vault.strategies[strategy].currentDebt = newDebt;
            emit IVault.DebtUpdated(strategy, currentDebt, newDebt);
            return newDebt;
        } else {
            uint256 maxDebt = vault.strategies[strategy].maxDebt;
            uint256 newDebt = Math.min(targetDebt, maxDebt);
            if (newDebt <= currentDebt) return currentDebt;

            uint256 _maxDeposit = IStrategy(strategy).maxDeposit(address(this));
            if (_maxDeposit == 0) return currentDebt;

            uint256 assetsToDeposit = newDebt - currentDebt;
            assetsToDeposit = Math.min(assetsToDeposit, _maxDeposit);
            if (vault.totalIdle <= vault.minimumTotalIdle) return currentDebt;
            assetsToDeposit = Math.min(
                assetsToDeposit,
                vault.totalIdle - vault.minimumTotalIdle
            );

            if (assetsToDeposit > 0) {
                address _asset = vault.asset();
                IERC20(_asset).safeIncreaseAllowance(strategy, assetsToDeposit);
                uint256 preBalance = IERC20(_asset).balanceOf(address(this));
                IStrategy(strategy).deposit(assetsToDeposit, address(this));
                uint256 postBalance = IERC20(_asset).balanceOf(address(this));
                IERC20(_asset).forceApprove(strategy, 0);
                assetsToDeposit = preBalance - postBalance;
                vault.totalIdle -= assetsToDeposit;
                vault.totalDebt += assetsToDeposit;
            }

            newDebt = currentDebt + assetsToDeposit;
            vault.strategies[strategy].currentDebt = newDebt;
            emit IVault.DebtUpdated(strategy, currentDebt, newDebt);
            return newDebt;
        }
    }

    function buyDebt(
        DataTypes.VaultData storage vault,
        address strategy,
        uint256 amount
    ) public {
        require(vault.strategies[strategy].activation != 0, "Not active");
        uint256 currentDebt = vault.strategies[strategy].currentDebt;
        require(currentDebt > 0 && amount > 0, "Nothing to buy");

        uint256 _amount = Math.min(amount, currentDebt);
        uint256 shares = (IStrategy(strategy).balanceOf(address(this)) *
            _amount) / currentDebt;

        require(shares > 0, "Cannot buy zero");
        IERC20(vault.asset()).safeTransferFrom(
            msg.sender,
            address(this),
            _amount
        );
        vault.strategies[strategy].currentDebt -= _amount;
        vault.totalDebt -= _amount;
        vault.totalIdle += _amount;
        IERC20(strategy).safeTransfer(msg.sender, shares);

        emit IVault.DebtUpdated(
            strategy,
            currentDebt,
            vault.strategies[strategy].currentDebt
        );
        emit IVault.DebtPurchased(strategy, _amount);
    }

    function ExecuteUpdateMaxDebtForStrategy(
        DataTypes.VaultData storage vault,
        address strategy,
        uint256 newMaxDebt
    ) external {
        require(
            vault.strategies[strategy].activation != 0,
            "Inactive strategy"
        );
        vault.strategies[strategy].maxDebt = newMaxDebt;
        emit IVault.DebtUpdated(
            strategy,
            vault.strategies[strategy].currentDebt,
            newMaxDebt
        );
    }
}
