"use client";

import { useEffect } from "react";

const LANDING_VISITED_KEY = "tnc-landing-visited";
const FORCE_LANDING_TOP_KEY = "tnc-force-landing-top";

export function AuthBackNavFlag() {
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(LANDING_VISITED_KEY) === "1") {
        window.sessionStorage.setItem(FORCE_LANDING_TOP_KEY, "1");
      }
    } catch (error) {
      console.warn("Unable to persist auth back-navigation flag.", error);
    }
  }, []);

  return null;
}
