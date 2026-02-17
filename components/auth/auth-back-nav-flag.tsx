"use client";

import { useEffect } from "react";

const LANDING_VISITED_KEY = "tnc-landing-visited";
const FORCE_LANDING_TOP_KEY = "tnc-force-landing-top";

export function AuthBackNavFlag() {
  useEffect(() => {
    try {
      const cameFromLanding = window.sessionStorage.getItem(LANDING_VISITED_KEY) === "1";
      if (!cameFromLanding) return;

      window.sessionStorage.setItem(FORCE_LANDING_TOP_KEY, "1");
      window.history.pushState({ tncAuthBackTrap: true }, "", window.location.href);

      const onPopState = () => {
        window.sessionStorage.setItem(FORCE_LANDING_TOP_KEY, "1");
        window.location.assign("/");
      };

      window.addEventListener("popstate", onPopState);
      return () => {
        window.removeEventListener("popstate", onPopState);
      };
    } catch (error) {
      console.warn("Unable to persist auth back-navigation flag.", error);
    }
  }, []);

  return null;
}
