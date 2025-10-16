// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

/* solhint-disable private-vars-leading-underscore */
/* solhint-disable var-name-mixedcase */

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import {OFT} from "@layerzerolabs/oft-evm/contracts/OFT.sol";
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
    /// @notice Whitelist users from max redeem / block
    mapping(address => bool) public maxRedeemWhitelist;

    /// @notice Max minted OverlayerWrap allowed per block
    uint256 public maxMintPerBlock;
    /// @notice Max redeemed OverlayerWrap allowed per block
    uint256 public maxRedeemPerBlock;
    /// @notice Max redeemed OverlayerWrap allowed per block minimum value
    uint256 public immutable minValmaxRedeemPerBlock;
    /// @notice Delay before maxRedeemPerBlock can be changed
    uint256 private constant REDEEM_CHANGE_DELAY = 15 days;
    /// @notice Timestamp at which a change was proposed
    uint256 public proposedRedeemChangeTime;
    /// @notice Value proposed for maxRedeemPerBlock
    uint256 public proposedMaxRedeemPerBlock;
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
        if (
            redeemedPerBlock[block.number] + redeemAmount_ >
            maxRedeemPerBlock &&
            !maxRedeemWhitelist[msg.sender]
        ) revert OverlayerWrapCoreMaxRedeemPerBlockExceeded();
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
    {
        minValmaxRedeemPerBlock = params_.minValmaxRedeemPerBlock;
    }

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

    /// @notice Whitelist or remove a user from the maxRedeemPerBlock exemption list
    /// @dev Only callable by an account with the DEFAULT_ADMIN_ROLE
    /// @param user_ The address of the user to whitelist or remove
    /// @param status_ True to whitelist the user (exempt from maxRedeemPerBlock), false to remove
    function whitelistMaxRedeemPerBlockUser(
        address user_,
        bool status_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxRedeemWhitelist[user_] = status_;
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

    /// @notice Propose a new maxRedeemPerBlock, starts the 15-day delay
    function proposeMaxRedeemPerBlock(
        uint256 newMaxRedeemPerBlock_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newMaxRedeemPerBlock_ == 0) {
            revert OverlayerWrapCoreInvalidMaxRedeemAmount();
        }
        proposedRedeemChangeTime = block.timestamp;
        proposedMaxRedeemPerBlock = newMaxRedeemPerBlock_;
        emit ProposedMaxRedeemPerBlock(newMaxRedeemPerBlock_, block.timestamp);
    }

    /// @notice Execute the previously proposed change after REDEEM_CHANGE_DELAY days
    function executeMaxRedeemPerBlockChange()
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (proposedRedeemChangeTime == 0) {
            revert OverlayerWrapCoreInvalidMaxRedeemAmount();
        }
        if (block.timestamp < proposedRedeemChangeTime + REDEEM_CHANGE_DELAY) {
            revert OverlayerWrapCoreDelayNotRespected();
        }

        uint256 newValue = proposedMaxRedeemPerBlock;

        // reset proposal state
        proposedRedeemChangeTime = 0;
        proposedMaxRedeemPerBlock = 0;

        _setMaxRedeemPerBlock(newValue);
    }

    /// @notice Disables the mint and redeem
    function disableMint() external onlyRole(GATEKEEPER_ROLE) {
        _setMaxMintPerBlock(0);
    }

    /// @notice Removes the collateral manager role from an account, this can ONLY be executed by the gatekeeper role
    /// @param collateralManager_ The address to remove the COLLATERAL_MANAGER_ROLE role from
    function removeCollateralManagerRole(
        address collateralManager_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(COLLATERAL_MANAGER_ROLE, collateralManager_);
    }

    /// @notice Pause the contract
    /// @dev This call is used only to lock the supplyToBacking public call
    function pause() external nonReentrant onlyRole(GATEKEEPER_ROLE) {
        _pause();
    }

    /// @notice Unpause the contract
    function unpause() external nonReentrant onlyRole(GATEKEEPER_ROLE) {
        _unpause();
    }

    /// @notice Supply funds to the active backing contract (aka approvedCollateralSpender)
    /// @dev The approveCollateralSpender will collect the funds, as the only entity allowed to do so
    /// @param amountCollateral_ The amount to supply of collateral
    /// @param amountACollateral_ The amount to supply of aCollateral
    function supplyToBacking(
        uint256 amountCollateral_,
        uint256 amountACollateral_
    ) external nonReentrant whenNotPaused {
        if (approvedCollateralSpender == address(0)) {
            revert OverlayerWrapCoreInvalidZeroAddress();
        }
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
        CollateralSpenderManager._initalize(admin_, collateral_, aCollateral_);
        if (collateral_.decimals > decimals()) {
            revert OverlayerWrapCoreInvalidDecimals();
        }
        if (aCollateral_.decimals > decimals()) {
            revert OverlayerWrapCoreInvalidDecimals();
        }
        if (
            IERC20Metadata(collateral.addr).decimals() != collateral_.decimals
        ) {
            revert OverlayerWrapCoreInvalidDecimals();
        }
        if (
            IERC20Metadata(aCollateral.addr).decimals() != aCollateral.decimals
        ) {
            revert OverlayerWrapCoreInvalidDecimals();
        }
        // Set the max mint/redeem limits per block
        _setMaxMintPerBlock(maxMintPerBlock_);
        _setMaxRedeemPerBlock(maxRedeemPerBlock_);
        hubChainId = hubChainId_;
    }

    /// @notice Validate the collateral tokens in an order
    /// @param order_ Order parameters to validate
    /// @dev Reverts if the collateral token is not valid
    /// @dev Reverts if the collateral amount is not valid
    /// @dev Given the precision of the collateral and the overlayer wrap, the collateral amount must be scaled to the overlayer wrap amount
    function _validateInputTokens(
        OverlayerWrapCoreTypes.Order calldata order_
    ) internal view {
        if (
            !(order_.collateral == aCollateral.addr ||
                order_.collateral == collateral.addr)
        ) {
            revert OverlayerWrapCoreCollateralNotValid();
        }
        uint256 diffDecimals = decimals() -
            (
                order_.collateral == aCollateral.addr
                    ? aCollateral.decimals
                    : collateral.decimals
            );
        uint256 scaledCollateralAmount = order_.collateralAmount *
            _pow10(diffDecimals);
        if (scaledCollateralAmount != order_.overlayerWrapAmount) {
            revert OverlayerWrapCoreInvalidAssetAmounts();
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
        onlyHubChain(block.chainid)
        returns (uint256 amountToBurn, uint256 back)
    {
        _validateInputTokens(order_);

        (
            uint256 checkedBurnAmount,
            uint256 checkedBack
        ) = _withdrawFromProtocol(
                order_.overlayerWrapAmount,
                order_.collateral
            );

        if (checkedBurnAmount == 0) return (0, 0);

        if (
            redeemedPerBlock[block.number] + checkedBurnAmount >
            maxRedeemPerBlock &&
            !maxRedeemWhitelist[msg.sender]
        ) revert OverlayerWrapCoreMaxRedeemPerBlockExceeded();
        // Add to the redeemed amount in this block
        redeemedPerBlock[block.number] += checkedBurnAmount;

        _transferToBeneficiary(
            order_.beneficiary,
            order_.collateral,
            checkedBack
        );

        amountToBurn = checkedBurnAmount;
        back = checkedBack;
    }

    function _pow10(uint256 n) internal pure returns (uint256 r) {
        // 10**77 < 2^256; 78 would overflow
        if (n > 77) revert OverlayerWrapCoreInvalidDecimals();
        return 10 ** n;
    }

    /// @notice Redeem collateral from the protocol
    /// @dev It will trigger the backing contract (aka approvedCollateralSpender) withdraw method if the collateral is not sufficient
    /// @dev Dust amount will be ignored. Burn amount is rounded to the collateral decimals value
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
            uint256 needAmount = amount_ / _pow10(diffDecimals);
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
            // Retrieve funds from backing only if needed
            if (amountFromBacking > 0) {
                IOverlayerWrapBacking(approvedCollateralSpender).withdraw(
                    amountFromBacking,
                    wantCollateral_
                );
            }

            back = needAmount;
            checkedBurnAmount = (back * (_pow10(diffDecimals)));
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
        if (
            maxRedeemPerBlock_ == 0 ||
            maxRedeemPerBlock_ < minValmaxRedeemPerBlock
        ) {
            revert OverlayerWrapCoreInvalidMaxRedeemAmount();
        }
        uint256 oldMaxRedeemPerBlock = maxRedeemPerBlock;
        maxRedeemPerBlock = maxRedeemPerBlock_;
        emit MaxRedeemPerBlockChanged(oldMaxRedeemPerBlock, maxRedeemPerBlock);
    }
}
