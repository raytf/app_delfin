import { BrowserWindow } from "electron";
import type { MinimizedOverlayVariant, OverlayMode } from "../../shared/types";
export declare function createOverlayWindow(mode: OverlayMode, minimizedVariant: MinimizedOverlayVariant): BrowserWindow;
export declare function setOverlayMode(window: BrowserWindow, mode: OverlayMode, minimizedVariant: MinimizedOverlayVariant): void;
