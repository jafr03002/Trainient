import { Redirect } from "wouter";

// /program lands on the build-your-own program page. The AI lineage still
// exists in the data model (and /program/my reads the manual lineage
// explicitly), but AI Coach mode is switched off for the alpha, so there is
// only one program page to land on and no profile lookup is needed to choose.
export default function ProgramRedirect() {
  return <Redirect to="/program/my" replace />;
}
