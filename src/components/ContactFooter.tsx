"use client";

import { useState } from "react";
import ContactModal from "./ContactModal";

export default function ContactFooter() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hover:text-ink transition-colors bg-transparent border-none p-0 cursor-pointer"
      >
        contact
      </button>
      <ContactModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
