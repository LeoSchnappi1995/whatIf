import React from 'react';
import { Route, Routes } from 'react-router-dom';

import Layout from './components/Layout';
import NotFound from './pages/NotFound/NotFound';
import WhatifHome from './pages/WhatifHome/WhatifHome';
import CastSetting from './pages/CastSetting/CastSetting';

const RoutesComponent = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<WhatifHome />} />
        <Route path="story-drafts/:draftId/cast" element={<CastSetting />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default RoutesComponent;
