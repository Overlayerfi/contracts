// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/Pool.sol";
import "./interfaces/AaveHandlerDefs.sol";

/**
 * @title AaveHandler
 * @notice This contract represent the Aave handler
 */
abstract contract AaveHandler is Ownable2Step, AaveHandlerDefs {
    using SafeERC20 for IERC20;

    address public AAVE = 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;
    address public USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address public USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
    address public AUSDC = 0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c;
    address public AUSDT = 0x23878914EFE38d27C4D67Ab83ed1b93A74D4086a;
    uint16 constant AAVE_REFERRAL_CODE = 0;
    address immutable USDO;
    address immutable sUSDO;

    uint256 public depositedUSDC;
    uint256 public depositedUSDT;

    modifier onlyUsdo() {
        if (msg.sender != USDO) {
            revert OperationNotAllowed();
        }
        _;
    }

    ///@notice The constructor
    ///@param admin The contract admin
    constructor(address admin, address usdo, address susdo) Ownable(admin) {
        if (admin == address(0)) revert ZeroAddressException();
        if (usdo == address(0)) revert ZeroAddressException();
        if (susdo == address(0)) revert ZeroAddressException();
        USDO = usdo;
        sUSDO = susdo;
    }

    ///@notice Supply funds to AAVE protocol
    ///@param amount The amount to supply intended as USDC and USDT
    function supply(uint256 amount) external {
        if (IERC20(USDC).balanceOf(address(this)) < amount)
            revert InsufficientBalance();
        if (IERC20(USDT).balanceOf(address(this)) < amount)
            revert InsufficientBalance();
        Pool(AAVE).supply(USDC, amount, address(this), AAVE_REFERRAL_CODE);
        Pool(AAVE).supply(USDT, amount, address(this), AAVE_REFERRAL_CODE);
        unchecked {
            depositedUSDC += amount;
            depositedUSDT += amount;
        }
    }

    ///@notice Withraw funds to AAVE protocol
    ///@param amount The amount to withdraw intended as USDC and USDT
    function withraw(uint256 amount) public onlyUsdo {
        if (IERC20(AUSDC).balanceOf(address(this)) < amount)
            revert InsufficientBalance();
        if (IERC20(AUSDT).balanceOf(address(this)) < amount)
            revert InsufficientBalance();
        Pool(AAVE).withraw(USDC, amount, USDO);
        Pool(AAVE).withraw(USDT, amount, USDO);
        if (amount > depositedUSDC) {
            depositedUSDC = 0;
        } else {
            unchecked {
                depositedUSDC -= amount;
            }
        }
        if (amount > depositedUSDT) {
            depositedUSDT = 0;
        } else {
            unchecked {
                depositedUSDT -= amount;
            }
        }
    }

    ///@notice Compound funds from-to AAVE protocol
    function compound() external {
        uint256 diffUSDC = IERC20(AUSDC).balanceOf(address(this)) -
            depositedUSDC;
        uint256 diffUSDT = IERC20(AUSDT).balanceOf(address(this)) -
            depositedUSDT;
        if (diffUSDC == 0 || diffUSDT == 0) {
            return;
        }
        if (diffUSDC < diffUSDT) {
            withraw(diffUSDC);
            //TODO: change the recipirnt / send reminder to default wallet: admin
            IERC20(AUSDT).transfer(owner(), diffUSDT - diffUSDC);

            //TODO: mint USDO

            //TODO: use the appropriate sUSDO function / transfer to sUSDO
        } else {
            withraw(diffUSDT);
            //TODO: change the recipirnt / send reminder to default wallet: admin
            IERC20(AUSDC).transfer(owner(), diffUSDC - diffUSDT);

            //TODO: mint USDO

            //TODO: use the appropriate sUSDO function / transfer to sUSDO
        }
    }

    ///@notice Renounce contract ownership
    ///@dev Reverts by design
    function renounceOwnership() public view override onlyOwner {
        revert CantRenounceOwnership();
    }
}
