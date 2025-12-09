import React from 'react';

const Logo = ({ className }) => (
  <svg
    width="44"
    height="44"
    viewBox="0 0 44 44"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <defs>
      <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: '#00d4ff', stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: '#0099cc', stopOpacity: 1 }} />
      </linearGradient>
    </defs>
    <rect width="44" height="44" rx="12" fill="url(#grad1)" />
    <path
      d="M14 22H16.5C17.0523 22 17.5 22.4477 17.5 23V29C17.5 29.5523 17.0523 30 16.5 30H14"
      stroke="white"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M21.5 14V30"
      stroke="white"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M29 17H31.5C32.0523 17 32.5 17.4477 32.5 18V29C32.5 29.5523 32.0523 30 31.5 30H29"
      stroke="white"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default Logo;