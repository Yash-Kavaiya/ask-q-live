import type { AiGateway } from './ai-gateway.js';
import {
  generateTwoLineAnswer,
  moderateQuestion,
  checkSemanticDeduplication,
  generatePostSessionReport,
  generateSeriesExecutiveReport,
} from './gemini.service.js';

/** Outer adapter: Gemini driver behind the use-case AiGateway port. */
export const geminiAiGateway: AiGateway = {
  generateTwoLineAnswer,
  moderateQuestion,
  checkSemanticDeduplication,
  generatePostSessionReport,
  generateSeriesExecutiveReport,
};
