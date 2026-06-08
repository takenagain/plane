/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { LucideIcon } from "lucide-react";
import {
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Globe,
  Layout,
  Link2,
  Mail,
  Share2,
} from "lucide-react";

type IconMatcher = {
  pattern: RegExp;
  icon: LucideIcon;
};

const SOCIAL_MEDIA_MATCHERS: IconMatcher[] = [
  { pattern: /github\.com/, icon: Share2 },
  { pattern: /linkedin\.com/, icon: Share2 },
  { pattern: /(twitter\.com|x\.com)/, icon: Share2 },
  { pattern: /facebook\.com/, icon: Share2 },
  { pattern: /instagram\.com/, icon: Share2 },
  { pattern: /youtube\.com/, icon: Share2 },
  { pattern: /dribbble\.com/, icon: Share2 },
];

const PRODUCTIVITY_MATCHERS: IconMatcher[] = [
  { pattern: /figma\.com/, icon: Layout },
  { pattern: /(google\.com|docs\.|doc\.)/, icon: FileText },
];

const FILE_TYPE_MATCHERS: IconMatcher[] = [
  { pattern: /\.(jpg|jpeg|png|gif|bmp|svg|webp)$/, icon: FileImage },
  { pattern: /\.(mp4|mov|avi|wmv|flv|mkv)$/, icon: FileVideo },
  { pattern: /\.(mp3|wav|ogg)$/, icon: FileAudio },
  { pattern: /\.(zip|rar|7z|tar|gz)$/, icon: FileArchive },
  { pattern: /\.(xls|xlsx|csv)$/, icon: FileSpreadsheet },
  { pattern: /\.(pdf|doc|docx|txt)$/, icon: FileText },
  { pattern: /\.(html|js|ts|jsx|tsx|css|scss)$/, icon: FileCode },
];

const OTHER_MATCHERS: IconMatcher[] = [
  { pattern: /^mailto:/, icon: Mail },
  { pattern: /^http/, icon: Globe },
];

export const getIconForLink = (url: string) => {
  const lowerUrl = url.toLowerCase();

  const allMatchers = [...SOCIAL_MEDIA_MATCHERS, ...PRODUCTIVITY_MATCHERS, ...FILE_TYPE_MATCHERS, ...OTHER_MATCHERS];

  const matchedIcon = allMatchers.find(({ pattern }) => pattern.test(lowerUrl));
  return matchedIcon?.icon ?? Link2;
};
