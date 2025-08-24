// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

/* solhint-disable private-vars-leading-underscore */
/* solhint-disable var-name-mixedcase */

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import { OFT } from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/IOverlayerWrapDefs.sol";
import "../shared/SingleAdminAccessControl.sol";
import "./CollateralSpenderManager.sol";
import "./interfaces/IMintRedeemManagerDefs.sol";
import "./interfaces/IOverlayerWrapBacking.sol";
import "./types/MintRedeemManagerTypes.sol";

/**
 * @title MintRedeemManager
 * @notice This contract mints and redeems the OverlayerWrap contract that inherits this contract
 */
abstract contract MintRedeemManager is
    IMintRedeemManagerDefs,
    OFT,
    ERC20Burnable,
    ERC20Permit,
    CollateralSpenderManager,
    Pausable
{
    using SafeERC20 for IERC20;

    /* --------------- CONSTANTS --------------- */

    /// @notice Role enabling to disable mint and redeem
    bytes32 private constant GATEKEEPER_ROLE = keccak256("GATEKEEPER_ROLE");

    /* --------------- STATE VARIABLES --------------- */

    /// @notice OverlayerWrap minted per block
    mapping(uint256 => uint256) public mintedPerBlock;
    /// @notice OverlayerWrap redeemed per block
    mapping(uint256 => uint256) public redeemedPerBlock;

    /// @notice Max minted OverlayerWrap allowed per block
    uint256 public maxMintPerBlock;
    /// @notice Max redeemed OverlayerWrap allowed per block
    uint256 public maxRedeemPerBlock;

    /* --------------- MODIFIERS --------------- */

    /// @notice Ensure that the already minted OverlayerWrap in the actual block plus the amount to be minted is below the maxMintPerBlock
    /// @param mintAmount The OverlayerWrap amount to be minted
    modifier belowMaxMintPerBlock(uint256 mintAmount) {
        if (mintedPerBlock[block.number] + mintAmount > maxMintPerBlock)
            revert MintRedeemManagerMaxMintPerBlockExceeded();
        _;
    }

    /// @notice Ensure that the already redeemed OverlayerWrap in the actual block plus the amount to be redeemed is below the maxRedeemPerBlock
    /// @param redeemAmount The OverlayerWrap amount to be redeemed
    modifier belowMaxRedeemPerBlock(uint256 redeemAmount) {
        if (redeemedPerBlock[block.number] + redeemAmount > maxRedeemPerBlock)
            revert MintRedeemManagerMaxRedeemPerBlockExceeded();
        _;
    }

    /* --------------- CONSTRUCTOR --------------- */

    constructor(IOverlayerWrapDefs.ConstructorParams memory params) 
      OFT(params.name, params.symbol, params.admin, params.admin)
      ERC20Permit(params.name)
      Ownable(msg.sender)
    {
    }

    /* --------------- PUBLIC --------------- */

    /// @inheritdoc Ownable
    /// @dev We resolve the multiple inheritance of {Ownable} and {SingleAdminAccessControl}
    /// by returning the owner defined in {SingleAdminAccessControl}.
    function owner() public view override(Ownable,SingleAdminAccessControl) returns(address) {
        return SingleAdminAccessControl.owner();
    }

    /* --------------- EXTERNAL --------------- */

    /**
     * @notice Fallback function to receive ether
     */
    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    /// @notice Approve an external spender.
    /// @dev The spender is handled by the CollateralSpenderManager contract
    /// @dev Normally this function is not used as the approval is managed by the acceptance flow
    function approveCollateral() external onlyRole(COLLATERAL_MANAGER_ROLE) {
        if (approvedCollateralSpender == address(0))
            revert MintRedeemManagerInvalidZeroAddress();
        IERC20(collateral.addr).forceApprove(
            approvedCollateralSpender,
            type(uint256).max
        );
        IERC20(aCollateral.addr).forceApprove(
            approvedCollateralSpender,
            type(uint256).max
        );
    }

    /// @notice Sets the max mintPerBlock limit
    /// @param maxMintPerBlock_ The new max value
    function setMaxMintPerBlock(
        uint256 maxMintPerBlock_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setMaxMintPerBlock(maxMintPerBlock_);
    }

    /// @notice Sets the max redeemPerBlock limit
    /// @param maxRedeemPerBlock_ The new max value
    function setMaxRedeemPerBlock(
        uint256 maxRedeemPerBlock_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setMaxRedeemPerBlock(maxRedeemPerBlock_);
    }

    /// @notice Disables the mint and redeem
    function disableMint() external onlyRole(GATEKEEPER_ROLE) {
        _setMaxMintPerBlock(0);
    }

    /// @notice Removes the collateral manager role from an account, this can ONLY be executed by the gatekeeper role
    /// @param collateralManager The address to remove the COLLATERAL_MANAGER_ROLE role from
    function removeCollateralManagerRole(
        address collateralManager
    ) external onlyRole(GATEKEEPER_ROLE) {
        _revokeRole(COLLATERAL_MANAGER_ROLE, collateralManager);
    }

    /// @notice Pause the contract
    /// @dev This call is used only to lock the supplyToBacking public call
    function pause() external nonReentrant onlyRole(GATEKEEPER_ROLE) {
        _pause();
    }

    /// @notice Unpause the contract
    /// @dev This call is used only to unlock the supplyToBacking public call
    function unpause() external nonReentrant onlyRole(GATEKEEPER_ROLE) {
        _unpause();
    }

    /// @notice Supply funds to the active backing contract (aka approvedCollateralSpender)
    /// @dev The approveCollateralSpender will colect the funds, as the only entity allowed to do so
    /// @param amountCollateral The amount to supply of collateral
    /// @param amountACollateral The amount to supply of aCollateral
    function supplyToBacking(
        uint256 amountCollateral,
        uint256 amountACollateral
    ) external nonReentrant whenNotPaused {
        if (approvedCollateralSpender != address(0)) {
            uint256 collateralBal = IERC20(collateral.addr).balanceOf(
                address(this)
            );
            uint256 aCollateralBal = IERC20(aCollateral.addr).balanceOf(
                address(this)
            );
            uint256 amountToSupplyCollateral = amountCollateral == 0
                ? collateralBal
                : amountCollateral;
            uint256 amountToSupplyACollateral = amountACollateral == 0
                ? aCollateralBal
                : amountACollateral;
            if (amountToSupplyCollateral > collateralBal)
                revert MintRedeemManagerInsufficientFunds();
            if (amountToSupplyACollateral > aCollateralBal)
                revert MintRedeemManagerInsufficientFunds();
            IOverlayerWrapBacking(approvedCollateralSpender).supply(
                amountToSupplyCollateral,
                collateral.addr
            );
            IOverlayerWrapBacking(approvedCollateralSpender).supply(
                amountToSupplyACollateral,
                aCollateral.addr
            );
            emit SuppliedToBacking(
                msg.sender,
                amountToSupplyCollateral,
                amountToSupplyACollateral
            );
        }
    }

    /* --------------- INTERNAL --------------- */

    /// @notice Initialize the contract with base parameters
    /// @param collateral_ Configuration for the main collateral token
    /// @param aCollateral_ Configuration for the associated collateral token
    /// @param admin Address of the contract administrator
    /// @param maxMintPerBlock_ Maximum amount that can be minted per block
    /// @param maxRedeemPerBlock_ Maximum amount that can be redeemed per block
    function _initialize(
        MintRedeemManagerTypes.StableCoin memory collateral_,
        MintRedeemManagerTypes.StableCoin memory aCollateral_,
        address admin,
        uint256 maxMintPerBlock_,
        uint256 maxRedeemPerBlock_
    ) internal {
        CollateralSpenderManager._initalize(admin, collateral_, aCollateral_);
        // Set the max mint/redeem limits per block
        _setMaxMintPerBlock(maxMintPerBlock_);
        _setMaxRedeemPerBlock(maxRedeemPerBlock_);
    }

    /// @notice Validate the collateral tokens in an order
    /// @param order Order parameters to validate
    /// @dev Reverts if the collateral token is not valid
    function _validateInputTokens(
        MintRedeemManagerTypes.Order calldata order
    ) internal view {
        if (
            !(order.collateral == aCollateral.addr ||
                order.collateral == collateral.addr)
        ) {
            revert MintRedeemManagerCollateralNotValid();
        }
    }

    /// @notice Internal function to handle minting operations
    /// @param order Order details containing mint parameters
    /// @dev Updates minted amount per block and transfers collateral
    function _managerMint(
        MintRedeemManagerTypes.Order calldata order
    ) internal belowMaxMintPerBlock(order.overlayerWrapAmount) {
        // Check for wanted source tokens
        _validateInputTokens(order);
        // Add to the minted amount in this block
        mintedPerBlock[block.number] += order.overlayerWrapAmount;
        _transferCollateral(
            order.collateralAmount,
            order.collateral,
            address(this)
        );
    }

    /// @notice Redeem stablecoins for assets
    /// @param order Struct containing order details
    function _managerRedeem(
        MintRedeemManagerTypes.Order calldata order
    )
        internal
        belowMaxRedeemPerBlock(order.overlayerWrapAmount)
        returns (uint256 amountToBurn, uint256 back)
    {
        // Check for wanted source tokens
        _validateInputTokens(order);
        // Add to the redeemed amount in this block
        redeemedPerBlock[block.number] += order.overlayerWrapAmount;

        (
            uint256 checkedBurnAmount,
            uint256 checkedBack
        ) = _withdrawFromProtocol(order.overlayerWrapAmount, order.collateral);

        _transferToBeneficiary(
            order.beneficiary,
            order.collateral,
            checkedBack
        );

        amountToBurn = checkedBurnAmount;
        back = checkedBack;
    }

    /// @notice Redeem collateral from the protocol
    /// @dev It will trigger the backing contract (aka approvedCollateralSpender) withdraw method if the collateral is not sufficient
    /// @param amount The amount of OverlayerWrap to burn
    /// @param wantCollateral The wanted collateral to withdraw
    /// @return checkedBurnAmount The checked amount to burn
    /// @return back The amount of the underlying or their aToken version returned to user
    function _withdrawFromProtocol(
        uint256 amount,
        address wantCollateral
    ) internal returns (uint256 checkedBurnAmount, uint256 back) {
        if (amount == 0) {
            return (0, 0);
        }
        //Here does hold the inveriant that decimals() >= token.decimals
        unchecked {
            uint256 diffDecimals = decimals() -
                (
                    wantCollateral == aCollateral.addr
                        ? aCollateral.decimals
                        : collateral.decimals
                );
            uint256 needAmount = amount / (10 ** diffDecimals);
            uint256 collateralBal = IERC20(
                wantCollateral == aCollateral.addr
                    ? aCollateral.addr
                    : collateral.addr
            ).balanceOf(address(this));

            // Compute the needed amount from backing contract
            uint256 amountFromBacking = 0;
            if (needAmount > collateralBal) {
                amountFromBacking = needAmount - collateralBal;
            }
            // Retrive funds from backing only if needed
            if (amountFromBacking > 0) {
                IOverlayerWrapBacking(approvedCollateralSpender).withdraw(
                    amountFromBacking,
                    wantCollateral
                );
            }

            back = needAmount;
            checkedBurnAmount = (back * (10 ** diffDecimals));
        }
    }

    /// @notice Transfer supported asset to beneficiary address
    /// @dev This contract needs to have available funds
    /// @dev Asset validation has to be performed by the caller
    /// @param beneficiary The redeem beneficiary
    /// @param asset The redeemed asset
    /// @param amount The redeemed amount
    function _transferToBeneficiary(
        address beneficiary,
        address asset,
        uint256 amount
    ) internal {
        IERC20(asset).safeTransfer(beneficiary, amount);
    }

    /// @notice Transfer supported asset to target addresses
    /// @dev User must have approved this contract for allowance
    /// @dev Asset validation has to be performed by the caller
    /// @param amount The amount to be transfered
    /// @param asset The asset to be transfered
    /// @param recipient The destination address
    function _transferCollateral(
        uint256 amount,
        address asset,
        address recipient
    ) internal {
        IERC20 token = IERC20(asset);
        token.safeTransferFrom(msg.sender, recipient, amount);
    }

    /// @notice Sets the max mintPerBlock limit
    /// @param maxMintPerBlock_ The new max value
    function _setMaxMintPerBlock(uint256 maxMintPerBlock_) internal {
        uint256 oldMaxMintPerBlock = maxMintPerBlock;
        maxMintPerBlock = maxMintPerBlock_;
        emit MaxMintPerBlockChanged(oldMaxMintPerBlock, maxMintPerBlock);
    }

    /// @notice Sets the max redeemPerBlock limit
    /// @param maxRedeemPerBlock_ The new max value
    function _setMaxRedeemPerBlock(uint256 maxRedeemPerBlock_) internal {
        if (maxRedeemPerBlock_ == 0) {
            revert MintRedeemManagerInvalidMaxRedeemAmount();
        }
        uint256 oldMaxRedeemPerBlock = maxRedeemPerBlock;
        maxRedeemPerBlock = maxRedeemPerBlock_;
        emit MaxRedeemPerBlockChanged(oldMaxRedeemPerBlock, maxRedeemPerBlock);
    }
}
