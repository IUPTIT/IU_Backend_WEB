import {
  canTransition,
  APPLICATION_STATUS,
} from "../applicationStateMachine.js";

describe("Application State Machine - canTransition()", () => {
  test("Case 1 (Hợp lệ): draft -> pending_review phải trả về true", () => {
    const isValid = canTransition(
      APPLICATION_STATUS.DRAFT,
      APPLICATION_STATUS.PENDING_REVIEW,
    );
    expect(isValid).toBe(true);
  });

  test("Case 2 (Hợp lệ): pending_review -> passed_cv hoặc failed_cv phải trả về true", () => {
    expect(
      canTransition(
        APPLICATION_STATUS.PENDING_REVIEW,
        APPLICATION_STATUS.PASSED_CV,
      ),
    ).toBe(true);
    expect(
      canTransition(
        APPLICATION_STATUS.PENDING_REVIEW,
        APPLICATION_STATUS.FAILED_CV,
      ),
    ).toBe(true);
  });

  test("Case 3 (Bất hợp lệ): draft -> admitted phải bị chặn (trả về false)", () => {
    const isValid = canTransition(
      APPLICATION_STATUS.DRAFT,
      APPLICATION_STATUS.ADMITTED,
    );
    expect(isValid).toBe(false);
  });

  test("Case 4 (Trạng thái kết thúc): admitted / rejected -> bất kỳ đâu đều trả về false", () => {
    // admitted -> passed_cv
    expect(
      canTransition(
        APPLICATION_STATUS.ADMITTED,
        APPLICATION_STATUS.PASSED_CV,
      ),
    ).toBe(false);

    // rejected -> draft
    expect(
      canTransition(APPLICATION_STATUS.REJECTED, APPLICATION_STATUS.DRAFT),
    ).toBe(false);

    // failed_cv -> pending_review
    expect(
      canTransition(
        APPLICATION_STATUS.FAILED_CV,
        APPLICATION_STATUS.PENDING_REVIEW,
      ),
    ).toBe(false);
  });
});
