import React from 'react';

export default class OutputArea extends React.Component {
  static displayName = 'OutputArea';

  static propTypes = {
    outputs: React.PropTypes.any,
  };

  render() {
    return (
      <div>
      {
        this.props.outputs
                  .map((output) => <pre>{JSON.stringify(output)}</pre>)
      }
      </div>
    );
  }
}