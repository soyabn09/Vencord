/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@api/Styles";
import { findByPropsLazy } from "@webpack";
import { GuildStore } from "@webpack/common";
import { Guild, GuildMember, Role } from "discord-types/general";

import { PermissionsSortOrder, settings } from ".";
import { PermissionType } from "./components/RolesAndUsersPermissions";

export const { getGuildPermissionSpecMap } = findByPropsLazy("getGuildPermissionSpecMap");

export const cl = classNameFactory("vc-permviewer-");

export function getSortedRoles({ id }: Guild, member: GuildMember) {
    const roles = GuildStore.getRoles(id);

    return [...member.roles, id]
        .map((id) => roles[id])
        .sort((a, b) => b.position - a.position);
}

export function sortUserRoles(roles: Role[]) {
    switch (settings.store.permissionsSortOrder) {
        case PermissionsSortOrder.HighestRole:
            return roles.sort((a, b) => b.position - a.position);
        case PermissionsSortOrder.LowestRole:
            return roles.sort((a, b) => a.position - b.position);
        default:
            return roles;
    }
}

export function sortPermissionOverwrites<
    T extends { id: string; type: number; },
>(overwrites: T[], guildId: string) {
    const roles = GuildStore.getRoles(guildId);

    return overwrites.sort((a, b) => {
        if (a.type !== PermissionType.Role || b.type !== PermissionType.Role)
            return 0;

        const roleA = roles[a.id];
        const roleB = roles[b.id];

        return roleB.position - roleA.position;
    });
}
