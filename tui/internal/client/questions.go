package client

import (
	"context"
	"net/http"
	"net/url"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func (c *Client) ListPendingQuestions(ctx context.Context, sessionID string) ([]gact.AgentQuestion, error) {
	var out struct {
		Questions []gact.AgentQuestion `json:"questions"`
	}
	q := url.Values{}
	q.Set("status", "pending")
	err := c.do(ctx, http.MethodGet, "/v1/sessions/"+url.PathEscape(sessionID)+"/questions?"+q.Encode(), nil, &out)
	return out.Questions, err
}

func (c *Client) CreateUserQuestion(
	ctx context.Context,
	sessionID string,
	req gact.CreateUserQuestionRequest,
) (gact.UserQuestion, error) {
	var out gact.UserQuestion
	path := "/v1/sessions/" + url.PathEscape(sessionID) + "/questions"
	err := c.do(ctx, http.MethodPost, path, req, &out)
	return out, err
}

func (c *Client) AnswerUserQuestion(
	ctx context.Context,
	sessionID string,
	questionID string,
	req gact.AnswerUserQuestionRequest,
) (gact.UserQuestion, error) {
	var out gact.UserQuestion
	path := "/v1/sessions/" + url.PathEscape(sessionID) + "/questions/" + url.PathEscape(questionID) + "/answer"
	err := c.do(ctx, http.MethodPost, path, req, &out)
	return out, err
}

func (c *Client) CancelUserQuestion(ctx context.Context, sessionID, questionID string) (gact.UserQuestion, error) {
	var out gact.UserQuestion
	path := "/v1/sessions/" + url.PathEscape(sessionID) + "/questions/" + url.PathEscape(questionID) + "/cancel"
	err := c.do(ctx, http.MethodPost, path, nil, &out)
	return out, err
}

func (c *Client) AnswerQuestion(
	ctx context.Context,
	sessionID string,
	questionID string,
	req gact.AgentQuestionAnswerRequest,
) error {
	_, err := c.AnswerUserQuestion(ctx, sessionID, questionID, req)
	return err
}

func (c *Client) ListTurnAttempts(ctx context.Context, sessionID string) ([]gact.TurnAttempt, error) {
	var out struct {
		Attempts []gact.TurnAttempt `json:"attempts"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/sessions/"+url.PathEscape(sessionID)+"/attempts", nil, &out)
	return out.Attempts, err
}

func (c *Client) RetryMessage(
	ctx context.Context,
	sessionID string,
	messageID string,
	req gact.RetryRequest,
) (gact.TurnAttempt, error) {
	var out gact.TurnAttempt
	path := "/v1/sessions/" + url.PathEscape(sessionID) + "/messages/" + url.PathEscape(messageID) + "/retry"
	err := c.do(ctx, http.MethodPost, path, req, &out)
	return out, err
}
