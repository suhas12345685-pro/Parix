import React from "react";

interface Props {
  page: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.page !== this.props.page && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="card mx-auto flex max-w-2xl flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-pink-400/35 bg-pink-500/10 text-lg font-semibold text-pink-200">
          !
        </div>
        <h2 className="text-xl font-semibold text-white">
          This view hit a runtime error
        </h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-[#a99bb9]">
          Aegis kept the shell alive. Switch pages or refresh after the backing
          data is fixed.
        </p>
        <pre className="mt-5 max-w-full overflow-auto rounded-lg border border-purple-400/20 bg-[#0e0714] p-4 text-left text-xs text-pink-100">
          {this.state.error.message}
        </pre>
      </div>
    );
  }
}
