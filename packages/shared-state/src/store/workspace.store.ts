/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { makeObservable, observableRef } from "mobx";

export interface IWorkspaceStore {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export class WorkspaceStore implements IWorkspaceStore {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;

  constructor(data: IWorkspaceStore) {
    makeObservable(this, {
      id: observableRef,
      name: observableRef,
      createdAt: observableRef,
      updatedAt: observableRef,
    });
    this.id = data.id;
    this.name = data.name;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }
}
