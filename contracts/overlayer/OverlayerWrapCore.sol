// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

/* solhint-disable private-vars-leading-underscore */
/* solhint-disable var-name-mixedcase */

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import {OFT} from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/IOverlayerWrapDefs.sol";
import "../shared/SingleAdminAccessControl.sol";
import "./CollateralSpenderManager.sol";
import "./interfaces/IOverlayerWrapCoreDefs.sol";
import "./interfaces/IOverlayerWrapBacking.sol";
import "./types/OverlayerWrapCoreTypes.sol";

/**
 * @title OverlayerWrapCore
 * @notice This contract mints and redeems the OverlayerWrap contract that inherits this contract
 */
abstract contract OverlayerWrapCore is
    IOverlayerWrapCoreDefs,
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
    /// @notice Hub chain id
    uint256 public hubChainId;

    /* --------------- MODIFIERS --------------- */

    /// @notice Ensure that the already minted OverlayerWrap in the actual block plus the amount to be minted is below the maxMintPerBlock
    /// @param mintAmount_ The OverlayerWrap amount to be minted
    modifier belowMaxMintPerBlock(uint256 mintAmount_) {
        if (mintedPerBlock[block.number] + mintAmount_ > maxMintPerBlock)
            revert OverlayerWrapCoreMaxMintPerBlockExceeded();
        _;
    }

    /// @notice Ensure that the already redeemed OverlayerWrap in the actual block plus the amount to be redeemed is below the maxRedeemPerBlock
    /// @param redeemAmount_ The OverlayerWrap amount to be redeemed
    modifier belowMaxRedeemPerBlock(uint256 redeemAmount_) {
        if (redeemedPerBlock[block.number] + redeemAmount_ > maxRedeemPerBlock)
            revert OverlayerWrapCoreMaxRedeemPerBlockExceeded();
        _;
    }

    /// @notice Restricts the execution of a function to only be callable by the `hubChain` address.
    /// @param chainId_ The current chain id
    modifier onlyHubChain(uint256 chainId_) {
        if (chainId_ != hubChainId) {
            revert OverlayerWrapCoreNotHubChainId();
        }
        _;
    }

    /* --------------- CONSTRUCTOR --------------- */

    /// @notice Initializes the OverlayerWrapCore contract with the provided parameters
    /// @dev Sets up the OFT, ERC20Permit, and Ownable functionality
    /// @param params_ A struct containing initialization parameters.
    constructor(
        IOverlayerWrapDefs.ConstructorParams memory params_
    )
        OFT(params_.name, params_.symbol, params_.lzEndpoint, params_.admin)
        ERC20Permit(params_.name)
        Ownable(msg.sender)
    {}

    /* --------------- PUBLIC --------------- */

    /// @inheritdoc Ownable
    /// @dev We resolve the multiple inheritance of {Ownable} and {SingleAdminAccessControl}
    /// by returning the owner defined in {SingleAdminAccessControl}.
    function owner()
        public
        view
        override(Ownable, SingleAdminAccessControl)
        returns (address)
    {
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
            revert OverlayerWrapCoreInvalidZeroAddress();
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
    /// @param collateralManager_ The address to remove the COLLATERAL_MANAGER_ROLE role from
    function removeCollateralManagerRole(
        address collateralManager_
    ) external onlyRole(GATEKEEPER_ROLE) {
        _revokeRole(COLLATERAL_MANAGER_ROLE, collateralManager_);
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
    /// @param amountCollateral_ The amount to supply of collateral
    /// @param amountACollateral_ The amount to supply of aCollateral
    function supplyToBacking(
        uint256 amountCollateral_,
        uint256 amountACollateral_
    ) external nonReentrant whenNotPaused {
        if (approvedCollateralSpender != address(0)) {
            uint256 collateralBal = IERC20(collateral.addr).balanceOf(
                address(this)
            );
            uint256 aCollateralBal = IERC20(aCollateral.addr).balanceOf(
                address(this)
            );
            uint256 amountToSupplyCollateral = amountCollateral_ == 0
                ? collateralBal
                : amountCollateral_;
            uint256 amountToSupplyACollateral = amountACollateral_ == 0
                ? aCollateralBal
                : amountACollateral_;
            if (amountToSupplyCollateral > collateralBal)
                revert OverlayerWrapCoreInsufficientFunds();
            if (amountToSupplyACollateral > aCollateralBal)
                revert OverlayerWrapCoreInsufficientFunds();
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
    /// @param admin_ Address of the contract administrator
    /// @param maxMintPerBlock_ Maximum amount that can be minted per block
    /// @param maxRedeemPerBlock_ Maximum amount that can be redeemed per block
    /// @param hubChainId_ The parent chain id
    function _initialize(
        OverlayerWrapCoreTypes.StableCoin memory collateral_,
        OverlayerWrapCoreTypes.StableCoin memory aCollateral_,
        address admin_,
        uint256 maxMintPerBlock_,
        uint256 maxRedeemPerBlock_,
        uint256 hubChainId_
    ) internal {
        if (collateral_.decimals > decimals()) {
            revert OverlayerWrapCoreInvalidDecimals();
        }
        if (aCollateral_.decimals > decimals()) {
            revert OverlayerWrapCoreInvalidDecimals();
        }
        CollateralSpenderManager._initalize(admin_, collateral_, aCollateral_);
        // Set the max mint/redeem limits per block
        _setMaxMintPerBlock(maxMintPerBlock_);
        _setMaxRedeemPerBlock(maxRedeemPerBlock_);
        hubChainId = hubChainId_;
    }

    /// @notice Validate the collateral tokens in an order
    /// @param order_ Order parameters to validate
    /// @dev Reverts if the collateral token is not valid
    function _validateInputTokens(
        OverlayerWrapCoreTypes.Order calldata order_
    ) internal view {
        if (
            !(order_.collateral == aCollateral.addr ||
                order_.collateral == collateral.addr)
        ) {
            revert OverlayerWrapCoreCollateralNotValid();
        }
    }

    /// @notice Internal function to handle minting operations
    /// @param order_ Order details containing mint parameters
    /// @dev Updates minted amount per block and transfers collateral
    function _managerMint(
        OverlayerWrapCoreTypes.Order calldata order_
    )
        internal
        belowMaxMintPerBlock(order_.overlayerWrapAmount)
        onlyHubChain(block.chainid)
    {
        // Check for wanted source tokens
        _validateInputTokens(order_);
        // Add to the minted amount in this block
        mintedPerBlock[block.number] += order_.overlayerWrapAmount;
        _transferCollateral(
            order_.collateralAmount,
            order_.collateral,
            address(this)
        );
    }

    /// @notice Redeem stablecoins for assets
    /// @param order_ Struct containing order details
    function _managerRedeem(
        OverlayerWrapCoreTypes.Order calldata order_
    )
        internal
        belowMaxRedeemPerBlock(order_.overlayerWrapAmount)
        onlyHubChain(block.chainid)
        returns (uint256 amountToBurn, uint256 back)
    {
        // Check for wanted source tokens
        _validateInputTokens(order_);
        // Add to the redeemed amount in this block
        redeemedPerBlock[block.number] += order_.overlayerWrapAmount;

        (
            uint256 checkedBurnAmount,
            uint256 checkedBack
        ) = _withdrawFromProtocol(
                order_.overlayerWrapAmount,
                order_.collateral
            );

        _transferToBeneficiary(
            order_.beneficiary,
            order_.collateral,
            checkedBack
        );

        amountToBurn = checkedBurnAmount;
        back = checkedBack;
    }

    /// @notice Redeem collateral from the protocol
    /// @dev It will trigger the backing contract (aka approvedCollateralSpender) withdraw method if the collateral is not sufficient
    /// @param amount_ The amount of OverlayerWrap to burn
    /// @param wantCollateral_ The wanted collateral to withdraw
    /// @return checkedBurnAmount The checked amount to burn
    /// @return back The amount of the underlying or their aToken version returned to user
    function _withdrawFromProtocol(
        uint256 amount_,
        address wantCollateral_
    ) internal returns (uint256 checkedBurnAmount, uint256 back) {
        if (amount_ == 0) {
            return (0, 0);
        }
        //Here does hold the inveriant that decimals() >= token.decimals
        unchecked {
            uint256 diffDecimals = decimals() -
                (
                    wantCollateral_ == aCollateral.addr
                        ? aCollateral.decimals
                        : collateral.decimals
                );
            uint256 needAmount = amount_ / (10 ** diffDecimals);
            uint256 collateralBal = IERC20(
                wantCollateral_ == aCollateral.addr
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
                    wantCollateral_
                );
            }

            back = needAmount;
            checkedBurnAmount = (back * (10 ** diffDecimals));
        }
    }

    /// @notice Transfer supported asset to beneficiary address
    /// @dev This contract needs to have available funds
    /// @dev Asset validation has to be performed by the caller
    /// @param beneficiary_ The redeem beneficiary
    /// @param asset_ The redeemed asset
    /// @param amount_ The redeemed amount
    function _transferToBeneficiary(
        address beneficiary_,
        address asset_,
        uint256 amount_
    ) internal {
        IERC20(asset_).safeTransfer(beneficiary_, amount_);
    }

    /// @notice Transfer supported asset to target addresses
    /// @dev User must have approved this contract for allowance
    /// @dev Asset validation has to be performed by the caller
    /// @param amount_ The amount to be transfered
    /// @param asset_ The asset to be transfered
    /// @param recipient_ The destination address
    function _transferCollateral(
        uint256 amount_,
        address asset_,
        address recipient_
    ) internal {
        IERC20 token = IERC20(asset_);
        token.safeTransferFrom(msg.sender, recipient_, amount_);
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
            revert OverlayerWrapCoreInvalidMaxRedeemAmount();
        }
        uint256 oldMaxRedeemPerBlock = maxRedeemPerBlock;
        maxRedeemPerBlock = maxRedeemPerBlock_;
        emit MaxRedeemPerBlockChanged(oldMaxRedeemPerBlock, maxRedeemPerBlock);
    }
}
