// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ISingleAdminAccessControl {
    error InvalidAdminChange();
    error NotPendingAdmin();

    ///@notice Emitted when the admin role has been transfered
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    ///@notice Emitted when an admin role transfer has been requested
    event AdminTransferRequested(
        address indexed oldAdmin,
        address indexed newAdmin
    );
}
