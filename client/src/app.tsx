import React from 'react';
import { Route, Routes } from 'react-router-dom';

import Layout from './components/Layout';
import NotFound from './pages/NotFound/NotFound';
import WhatifHome from './pages/WhatifHome/WhatifHome';
import CastSetting from './pages/CastSetting/CastSetting';
import {
  AdvancedPage,
  CharacterEditorPage,
  CharacterListPage,
  FriendCharacterPage,
  GenerationPage,
  InvitationLandingPage,
  InviteFriendsPage,
  ParticipatedStoriesPage,
  PublishPage,
  ResultPage,
  SceneEditorPage,
  StoriesPage,
  TimelinePage,
  WorkDetailPage,
  WorldviewEditorPage,
} from './pages/WhatifFlow/WhatifFlow';

const RoutesComponent = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<WhatifHome />} />
        <Route path="story-drafts/:draftId/cast" element={<CastSetting />} />
        <Route path="story-drafts/:draftId/scene/new" element={<SceneEditorPage />} />
        <Route path="story-drafts/:draftId/advanced" element={<AdvancedPage />} />
        <Route path="story-drafts/:draftId/invite" element={<InviteFriendsPage />} />
        <Route path="characters" element={<CharacterListPage />} />
        <Route path="characters/new" element={<CharacterEditorPage />} />
        <Route path="characters/:characterId" element={<CharacterEditorPage />} />
        <Route path="worldviews/new" element={<WorldviewEditorPage />} />
        <Route path="worldviews/:worldviewId" element={<WorldviewEditorPage />} />
        <Route path="works/:workId" element={<WorkDetailPage />} />
        <Route path="video-tasks/:taskId" element={<GenerationPage />} />
        <Route path="video-results/:taskId" element={<ResultPage />} />
        <Route path="video-results/:taskId/publish" element={<PublishPage />} />
        <Route path="stories" element={<StoriesPage />} />
        <Route path="stories/:storyId/timeline" element={<TimelinePage />} />
        <Route path="stories/:storyId/advanced" element={<AdvancedPage />} />
        <Route path="stories/:storyId/publish" element={<PublishPage />} />
        <Route path="invitations/:invitationId" element={<InvitationLandingPage />} />
        <Route path="invitations/:invitationId/character" element={<FriendCharacterPage />} />
        <Route path="participated-stories" element={<ParticipatedStoriesPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default RoutesComponent;
