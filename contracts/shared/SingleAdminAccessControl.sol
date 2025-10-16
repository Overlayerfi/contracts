// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/interfaces/IERC5313.sol";
import "./interfaces/ISingleAdminAccessControl.sol";

/**
 * @title SingleAdminAccessControl
 */
abstract contract SingleAdminAccessControl is
    IERC5313,
    ISingleAdminAccessControl,
    AccessControl
{
    address private _currentDefaultAdmin;
    address private _pendingDefaultAdmin;

    modifier notAdmin(bytes32 role_) {
        if (role_ == DEFAULT_ADMIN_ROLE) revert InvalidAdminChange();
        _;
    }

    /// @notice Transfer the admin role to a new address
    /// @notice This can ONLY be executed by the current admin
    /// @param newAdmin_ address
    function transferAdmin(
        address newAdmin_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newAdmin_ == msg.sender) revert InvalidAdminChange();
        _pendingDefaultAdmin = newAdmin_;
        emit AdminTransferRequested(_currentDefaultAdmin, newAdmin_);
    }

    /// @notice New admin role acceptance
    function acceptAdmin() external {
        if (msg.sender != _pendingDefaultAdmin) revert NotPendingAdmin();
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        delete _pendingDefaultAdmin;
    }

    /// @notice Grant a role
    /// @notice Can only be executed by the current single admin
    /// @notice Admin role cannot be granted externally
    /// @param role_ bytes32
    /// @param account_ address
    function grantRole(
        bytes32 role_,
        address account_
    ) public override onlyRole(DEFAULT_ADMIN_ROLE) notAdmin(role_) {
        _grantRole(role_, account_);
    }

    /// @notice Revoke a role
    /// @notice Can only be executed by the current admin
    /// @notice Admin role cannot be revoked
    /// @param role_ bytes32
    /// @param account_ address
    function revokeRole(
        bytes32 role_,
        address account_
    ) public override onlyRole(DEFAULT_ADMIN_ROLE) notAdmin(role_) {
        _revokeRole(role_, account_);
    }

    /// @notice renounce the role of msg.sender
    /// @notice admin role cannot be renounced
    /// @param role_ bytes32
    /// @param account_ address
    function renounceRole(
        bytes32 role_,
        address account_
    ) public virtual override notAdmin(role_) {
        super.renounceRole(role_, account_);
    }

    ///@dev See {IERC5313-owner}.
    function owner() public view virtual returns (address) {
        return _currentDefaultAdmin;
    }

    ///@notice No way to change admin without removing old admin first
    ///@param role_ The role
    ///@param account_ The account address
    function _grantRole(
        bytes32 role_,
        address account_
    ) internal override returns (bool) {
        if (role_ == DEFAULT_ADMIN_ROLE) {
            emit AdminTransferred(_currentDefaultAdmin, account_);
            _revokeRole(DEFAULT_ADMIN_ROLE, _currentDefaultAdmin);
            _currentDefaultAdmin = account_;
            delete _pendingDefaultAdmin;
        }
        return super._grantRole(role_, account_);
    }
}
