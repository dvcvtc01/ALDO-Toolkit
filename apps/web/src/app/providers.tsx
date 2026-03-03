"use client";

import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import type { ReactNode } from "react";

const theme = {
  ...webLightTheme,
  colorBrandBackground: "#0f766e",
  colorBrandBackgroundHover: "#115e59",
  colorBrandBackgroundPressed: "#134e4a",
  colorBrandForeground1: "#0f766e",
  colorNeutralBackground1: "#f6f9fb",
  colorNeutralBackground3: "#e4eef2"
};

export const Providers = ({ children }: { children: ReactNode }) => (
  <FluentProvider theme={theme}>{children}</FluentProvider>
);
