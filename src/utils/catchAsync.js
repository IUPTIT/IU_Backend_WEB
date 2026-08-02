// Forward rejected promises from async handlers to the error middleware.
export default function catchAsync(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
