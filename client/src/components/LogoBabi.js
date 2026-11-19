import React from 'react';

/** Emblème BABI RESIDENCE : maison et immeubles. Les parties bleu nuit
 *  suivent `currentColor` pour rester lisibles en mode sombre. */
const LogoBabi = ({ className, titre }) => (
  <svg className={className} viewBox="0 0 120 100" role={titre ? 'img' : undefined} aria-hidden={titre ? undefined : true} aria-label={titre}>
    <g fill="currentColor">
      <path d="M58 64V20l11-6v50z" />
      <path d="M72 64V8l12-6v62z" />
      <path d="M87 64V22l9 5v37z" />
    </g>
    <path d="M14 58L50 28l24 20" fill="none" stroke="#E0A526" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M27 50v20" fill="none" stroke="#E0A526" strokeWidth="8" strokeLinecap="round" />
    <g fill="currentColor">
      <rect x="38" y="43" width="9" height="9" rx="1" /><rect x="49" y="43" width="9" height="9" rx="1" />
      <rect x="38" y="54" width="9" height="9" rx="1" /><rect x="49" y="54" width="9" height="9" rx="1" />
    </g>
    <path d="M6 88C30 70 62 66 112 66C78 72 52 80 30 92C22 96 10 94 6 88z" fill="#E0A526" />
    <path d="M34 94C58 80 84 74 114 72C96 80 74 90 56 96C48 98 40 97 34 94z" fill="currentColor" />
  </svg>
);

export default LogoBabi;
