"use client";

import { useState } from "react";

type ContactFormProps = {
  email?: string;
};

export function ContactForm({ email }: ContactFormProps) {
  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const body = [`Name: ${name}`, `Email: ${from}`, "", message].join("\n");
    if (email) {
      const href = `mailto:${email}?subject=${encodeURIComponent("Contact")}&body=${encodeURIComponent(body)}`;
      window.location.href = href;
    } else {
      void navigator.clipboard?.writeText(body);
    }
    setSent(true);
  };

  return (
    <form className="g-contact" onSubmit={submit}>
      <label>
        Name *
        <input className="g-contact-field" value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <label>
        Email Address *
        <input
          className="g-contact-field"
          type="email"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          required
        />
      </label>
      <label>
        Message *
        <textarea
          className="g-contact-field g-contact-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          required
        />
      </label>
      <button type="submit" className="g-contact-submit">
        Submit
      </button>
      {sent ? <p className="g-contact-thanks">Thank you!</p> : null}
    </form>
  );
}
