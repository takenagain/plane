import type { TPageExtended } from "@plane/types";

export type TExtendedPageInstance = TPageExtended & {
  asJSONExtended: TPageExtended;
};

export class ExtendedBasePage implements TExtendedPageInstance {
  get asJSONExtended(): TExtendedPageInstance["asJSONExtended"] {
    return {};
  }
}
