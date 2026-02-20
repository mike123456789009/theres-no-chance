"use client";

import { useEffect } from "react";

export function MarketsFilterEnhancer() {
  useEffect(() => {
    const form = document.querySelector<HTMLFormElement>(".markets-toolbar");
    if (!form) return;

    const selects = Array.from(
      form.querySelectorAll<HTMLSelectElement>('select[name="status"], select[name="access"], select[name="sort"]')
    );
    if (selects.length === 0) return;

    const onSelectChange = () => {
      form.requestSubmit();
    };

    selects.forEach((select) => {
      select.addEventListener("change", onSelectChange);
    });

    return () => {
      selects.forEach((select) => {
        select.removeEventListener("change", onSelectChange);
      });
    };
  }, []);

  return null;
}
