import React from 'https://esm.sh/react@18';
import { createRoot } from 'https://esm.sh/react-dom@18/client';
import * as Recharts from 'https://esm.sh/recharts@2';

import O2LogApp from './O2LogApp.js';

const el = document.getElementById('root');
createRoot(el).render(React.createElement(O2LogApp, { React, Recharts }));
