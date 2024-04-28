// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

import "./interfaces/IStakingRewardsDistributor.sol";
import "../token/interfaces/IStakedUSDOCoolDown.sol";
import "../token/interfaces/IStakedUSDO.sol";
import "../token/interfaces/IUSDOM.sol";
import "../token/interfaces/IStakedUSDO.sol";
import "../token/types/MintRedeemManagerTypes.sol";

/**
 * @title StakingRewardsDistributor
 * @notice This helper contract allow us to distribute the staking rewards without the need of multisig transactions. It increases
 * the distribution frequency and automates almost the whole process, we also mitigate some arbitrage opportunities with this approach.
 * @dev We have one role:
 *      - The owner of this helper will be the multisig, only used for configuration calls.
 *      - The operator is only allowed to mint USDO using the available funds that land
 *        in this contract and calling transferInRewards to send the minted USDO rewards to the staking contract. The operator
 *        can be replaced by the owner at any time with a single transaction.
 */
contract StakingRewardsDistributor is
    Ownable2Step,
    IStakingRewardsDistributor,
    ReentrancyGuard
{
    using SafeERC20 for IERC20;

    // ---------------------- Constants -----------------------
    /// @notice Placeholder address for ETH
    address internal constant _ETH_ADDRESS =
        0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    // ---------------------- Immutables -----------------------
    /// @notice Staking contract
    IStakedUSDO public immutable STAKING_VAULT;
    /// @notice USDO stablecoin
    IUSDOM public immutable USDX_TOKEN;
    /// @notice USDC stablecoin
    IERC20 public immutable USDC_TOKEN;
    /// @notice USDT stablecoin
    IERC20 public immutable USDT_TOKEN;

    // ---------------------- Storage --------------------------
    /// @notice Only address authorized to invoke transferInRewards
    address public operator;

    constructor(
        IStakedUSDO stakingVault,
        IUSDOM usdo,
        IERC20 usdc,
        IERC20 usdt,
        address admin,
        address _operator
    ) Ownable(msg.sender) {
        // Constructor params check
        if (address(stakingVault) == address(0)) revert InvalidZeroAddress();
        if (address(usdo) == address(0)) revert InvalidZeroAddress();
        if (address(usdc) == address(0)) revert InvalidZeroAddress();
        if (address(usdt) == address(0)) revert InvalidZeroAddress();
        if (admin == address(0)) revert InvalidZeroAddress();
        if (_operator == address(0)) revert InvalidZeroAddress();

        // Assign immutables
        STAKING_VAULT = stakingVault;
        USDX_TOKEN = usdo;
        USDC_TOKEN = usdc;
        USDT_TOKEN = usdt;

        // Set the operator and delegate the signer
        setOperator(_operator);

        // Approve USDC and USDT to USDO
        USDC_TOKEN.safeIncreaseAllowance(address(usdo), type(uint256).max);
        USDT_TOKEN.safeIncreaseAllowance(address(usdo), type(uint256).max);
        // Also approve USDO to the staking contract to allow the transferInRewards call
        IERC20(address(USDX_TOKEN)).safeIncreaseAllowance(
            address(STAKING_VAULT),
            type(uint256).max
        );

        if (msg.sender != admin) {
            _transferOwnership(admin);
        }
    }

    /**
     * @notice Only the operator can call transferInRewards in order to transfer USDO to the staking contract
     * @param amountUsdc the amount of USDC
     * @param amountUsdt the amount of USDT
     * @param amountUsdx the amount of USDO
     * @dev In order to use this function, we need to set this contract as the REWARDER_ROLE in the staking contract
     *      No need to check that the input amount is not 0, since we already check this in the staking contract
     *      The 50/50 USDC/USDT split invariant for the mint oder is checked at lower contract level
     */
    function transferInRewards(
        uint256 amountUsdc,
        uint256 amountUsdt,
        uint256 amountUsdx
    ) external {
        if (msg.sender != operator) revert OnlyOperator();

        // Check that this contract holds enough USDC/USDT balance to transfer
        if (USDC_TOKEN.balanceOf(address(this)) < amountUsdc)
            revert InsufficientFunds();
        if (USDT_TOKEN.balanceOf(address(this)) < amountUsdt)
            revert InsufficientFunds();

        MintRedeemManagerTypes.Order memory order = MintRedeemManagerTypes
            .Order(
                address(this),
                address(this),
                address(USDT_TOKEN),
                address(USDC_TOKEN),
                amountUsdt,
                amountUsdc,
                amountUsdx
            );
        USDX_TOKEN.mint(order);

        STAKING_VAULT.transferInRewards(amountUsdx);
    }

    /**
     * @notice Owner can rescue tokens that were accidentally sent to the contract
     * @param token the token to transfer
     * @param to the address to send the tokens to
     * @param amount the amount of tokens to send
     * @dev Only available for the owner
     */
    function rescueTokens(
        address token,
        address to,
        uint256 amount
    ) external nonReentrant onlyOwner {
        if (token == address(0)) revert InvalidZeroAddress();
        if (to == address(0)) revert InvalidZeroAddress();
        if (amount == 0) revert InvalidAmount();

        // contract should never hold ETH
        if (token == _ETH_ADDRESS) {
            (bool success, ) = to.call{value: amount}("");
            if (!success) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
        emit TokensRescued(token, to, amount);
    }

    /**
     * @notice Revokes the previously granted ERC20 approvals from a specific address
     * @param assets assets to revoke
     * @param target address to revoke the approvals from
     * @dev only available for the owner. Can't revoke the approvals from the current minting contract
     */
    function revokeApprovals(
        address[] calldata assets,
        address target
    ) external onlyOwner {
        if (assets.length == 0) revert NoAssetsProvided();
        if (target == address(0)) revert InvalidZeroAddress();

        // Revoke approvals from specified address
        for (uint256 i = 0; i < assets.length; ) {
            IERC20(assets[i]).forceApprove(target, 0);
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Sets a new operator
     * @param _operator new operator and delegated signer
     */
    function setOperator(address _operator) public onlyOwner {
        operator = _operator;
        emit OperatorUpdated(_operator, operator);
    }

    /**
     * @notice prevents the owner from renouncing the owner role
     */
    function renounceOwnership() public view override onlyOwner {
        revert CantRenounceOwnership();
    }
}
