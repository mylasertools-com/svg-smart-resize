export const examples = {
  plate: {
    label: 'Mounting plate',
    description: 'Four mounting holes and an enclosed slot.',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="64mm" viewBox="0 0 100 64"><rect id="plate" width="100" height="64" rx="4" fill="#e7d6bc" stroke="#947953" stroke-width=".45"/><circle id="top-left" cx="12" cy="12" r="3" fill="#f4f5f2" stroke="#947953" stroke-width=".4"/><circle id="top-right" cx="88" cy="12" r="3" fill="#f4f5f2" stroke="#947953" stroke-width=".4"/><circle id="bottom-left" cx="12" cy="52" r="3" fill="#f4f5f2" stroke="#947953" stroke-width=".4"/><circle id="bottom-right" cx="88" cy="52" r="3" fill="#f4f5f2" stroke="#947953" stroke-width=".4"/><rect id="mounting-slot" x="34" y="30" width="32" height="4" fill="#f4f5f2" stroke="#947953" stroke-width=".4"/></svg>',
  },
  tag: {
    label: 'Pendant / tag',
    description: 'Change the silhouette size. Keep the jump-ring hole.',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="48mm" height="72mm" viewBox="0 0 48 72"><path id="tag" fill="#bfded9" stroke="#548e84" stroke-width=".5" fill-rule="evenodd" d="M24 0C36 0 48 18 48 37C48 55 34 72 24 72C14 72 0 55 0 37C0 18 12 0 24 0ZM27 10A3 3 0 1 0 21 10A3 3 0 1 0 27 10Z"/><path data-resize="scale" d="M24 25C12 29 13 46 24 53C35 46 36 29 24 25ZM24 29V49" fill="none" stroke="#548e84" stroke-width=".7"/></svg>',
  },
  panel: {
    label: 'Slotted panel',
    description: 'Open slots preserve their width, with depth scaled or fixed.',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="120mm" height="64mm" viewBox="0 0 120 64"><path id="panel" d="M0 0H28V24H32V0H58V24H62V0H88V24H92V0H120V64H0Z" fill="#cdd5f0" stroke="#7583b0" stroke-width=".45"/><circle id="mount-left" cx="12" cy="52" r="3" fill="#f4f5f2" stroke="#7583b0" stroke-width=".4"/><circle id="mount-right" cx="108" cy="52" r="3" fill="#f4f5f2" stroke="#7583b0" stroke-width=".4"/></svg>',
  },
};
